import { spawn } from "node:child_process";

export type GitProvider = "azure" | "gitlab" | "bitbucket";

export interface GitRepoRef {
  provider: GitProvider;
  host: string;
  /** https clone URL without credentials. */
  cloneUrl: string;
  /** Human label, e.g. "org/project/repo". */
  label: string;
  /** Branch named in the URL (Azure ?version=GB…, GitLab /-/tree/…, Bitbucket /src/…), if any. */
  branch: string | null;
}

const BUILTIN_HOSTS: Record<string, GitProvider> = {
  "dev.azure.com": "azure",
  "gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
};

/** Default git usernames for token auth on each provider. */
export const DEFAULT_USERNAME: Record<GitProvider, string> = { azure: "pat", gitlab: "oauth2", bitbucket: "x-token-auth" };

/** Self-hosted servers: GIT_EXTRA_HOSTS="gitlab.corp.com=gitlab,tfs.corp.com=azure". */
function extraHosts(): Record<string, GitProvider> {
  const out: Record<string, GitProvider> = {};
  for (const pair of (process.env.GIT_EXTRA_HOSTS ?? "").split(",")) {
    const [h, p] = pair.split("=").map((s) => s?.trim().toLowerCase());
    if (h && (p === "azure" || p === "gitlab" || p === "bitbucket")) out[h] = p;
  }
  return out;
}

export function providerForHost(host: string): GitProvider | null {
  const h = host.toLowerCase();
  if (/^[a-z0-9-]+\.visualstudio\.com$/.test(h)) return "azure";
  return BUILTIN_HOSTS[h] ?? extraHosts()[h] ?? null;
}

const SEGMENT = /^[A-Za-z0-9._~%() -]{1,200}$/;
const BRANCH = /^(?!-)(?!.*(?:\.\.|\/\/|@\{|\\))[A-Za-z0-9._\-/]{1,200}(?<![/.])$/;
export const isGitBranch = (b: string) => BRANCH.test(b) && !b.endsWith(".lock");

/** Parses a browser or clone URL from Azure DevOps, GitLab or Bitbucket. Returns null for anything else. */
export function parseGitUrl(input: string): GitRepoRef | null {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.port) return null;
  const host = u.hostname.toLowerCase();
  const provider = providerForHost(host);
  if (!provider) return null;
  const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  if (parts.some((p) => !SEGMENT.test(p) || p === "." || p === "..")) return null;
  const enc = (p: string[]) => p.map(encodeURIComponent).join("/");
  let branch: string | null = null;

  if (provider === "azure") {
    const gi = parts.indexOf("_git");
    if (gi < 1 || !parts[gi + 1]) return null;
    // dev.azure.com/{org}/{project}/_git/{repo}  |  {org}.visualstudio.com/{project}/_git/{repo}
    const prefix = parts.slice(0, gi);
    const repo = parts[gi + 1];
    const version = u.searchParams.get("version");
    if (version?.startsWith("GB")) branch = version.slice(2);
    const label = host === "dev.azure.com" ? [...prefix, repo].join("/") : [host.split(".")[0], ...prefix, repo].join("/");
    const ref = { provider, host, cloneUrl: `https://${host}/${enc(prefix)}/_git/${encodeURIComponent(repo)}`, label, branch };
    return branch && !isGitBranch(branch) ? { ...ref, branch: null } : ref;
  }

  if (provider === "gitlab") {
    const dash = parts.indexOf("-");
    const repoParts = dash >= 0 ? parts.slice(0, dash) : parts;
    if (dash >= 0 && parts[dash + 1] === "tree" && parts[dash + 2]) branch = parts.slice(dash + 2).join("/");
    if (repoParts.length < 2) return null;
    repoParts[repoParts.length - 1] = repoParts[repoParts.length - 1].replace(/\.git$/i, "");
    return { provider, host, cloneUrl: `https://${host}/${enc(repoParts)}.git`, label: repoParts.join("/"), branch: branch && isGitBranch(branch) ? branch : null };
  }

  // bitbucket: /{workspace}/{repo}[/src/{branch}]
  if (parts.length < 2) return null;
  const [ws, rawRepo] = parts;
  if (parts[2] === "src" && parts[3]) branch = parts[3];
  const repo = rawRepo.replace(/\.git$/i, "");
  return { provider, host, cloneUrl: `https://${host}/${enc([ws, repo])}.git`, label: `${ws}/${repo}`, branch: branch && isGitBranch(branch) ? branch : null };
}

export interface GitAuth { username: string; secret: string }

/** git env that injects a Basic auth header for this host only, so the secret never lands in argv or .git/config. */
function gitEnv(ref: GitRepoRef, auth: GitAuth | null): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_ASKPASS: "echo",
  };
  if (auth) {
    const basic = Buffer.from(`${auth.username}:${auth.secret}`).toString("base64");
    Object.assign(env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `http.https://${ref.host}/.extraheader`, GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` });
  }
  return env as unknown as NodeJS.ProcessEnv;
}

function runGit(args: string[], env: NodeJS.ProcessEnv, secrets: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env, signal });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { if (out.length < 2_000_000) out += d; });
    child.stderr.on("data", (d) => { if (err.length < 4000) err += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out);
      let msg = err.trim().split("\n").pop() ?? "";
      for (const s of secrets) if (s) msg = msg.split(s).join("[REDACTED]");
      reject(new Error(/Authentication failed|403|401|could not read Username/i.test(err)
        ? "The repository host rejected the credentials. Check that the token is valid and has read access to code."
        : `git ${args[0]} failed (exit ${code}): ${msg}`));
    });
  });
}

const secretsOf = (auth: GitAuth | null) => (auth ? [auth.secret, Buffer.from(`${auth.username}:${auth.secret}`).toString("base64")] : []);

/** Shallow, single-branch clone. Without a branch, the remote's default branch is used. */
export async function cloneGit(ref: GitRepoRef, branch: string | null, auth: GitAuth | null, dest: string, signal?: AbortSignal): Promise<void> {
  if (branch && !isGitBranch(branch)) throw new Error("Invalid branch name");
  const args = ["clone", "--depth", "1", "--single-branch", "--no-tags", ...(branch ? ["--branch", branch] : []), "--", ref.cloneUrl, dest];
  await runGit(args, gitEnv(ref, auth), secretsOf(auth), 300_000, signal);
}

/** Branch names on the remote, default branch first when it can be determined. */
export async function listRemoteBranches(ref: GitRepoRef, auth: GitAuth | null): Promise<{ branches: string[]; defaultBranch: string | null }> {
  const out = await runGit(["ls-remote", "--symref", "--", ref.cloneUrl, "HEAD", "refs/heads/*"], gitEnv(ref, auth), secretsOf(auth), 60_000);
  const head = /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(out)?.[1] ?? null;
  const all = [...out.matchAll(/\trefs\/heads\/(\S+)$/gm)].map((m) => m[1]).filter(isGitBranch);
  return { branches: [...new Set([...(head ? [head] : []), ...all])].slice(0, 300), defaultBranch: head };
}
