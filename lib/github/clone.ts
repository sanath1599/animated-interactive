import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SECRET_FILE_RES: RegExp[] = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^\.(npmrc|netrc|pypirc|git-credentials)$/i,
  /^(credentials|secrets?)\.(json|ya?ml|toml)$/i,
  /^service-account.*\.json$/i,
];
const SAFE_ENV = /^\.env\.(example|sample|template|dist|defaults?)$/i;

export const isSecretFile = (name: string) => !SAFE_ENV.test(name) && SECRET_FILE_RES.some((re) => re.test(name));

/** Removes secret-looking files and symlinks leaving the tree. Returns removed relative paths. */
export function sanitizeWorkspace(root: string): string[] {
  const removed: string[] = [];
  const rootReal = fs.realpathSync(root);
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isSymbolicLink()) {
        let inside = false;
        try {
          const rel = path.relative(rootReal, fs.realpathSync(p));
          inside = !rel.startsWith("..") && !path.isAbsolute(rel);
        } catch { /* dangling */ }
        if (!inside) { fs.rmSync(p, { force: true }); removed.push(path.relative(root, p)); }
      } else if (ent.isDirectory()) {
        if (ent.name === ".git") fs.rmSync(p, { recursive: true, force: true });
        else walk(p);
      } else if (isSecretFile(ent.name)) {
        fs.rmSync(p, { force: true });
        removed.push(path.relative(root, p));
      }
    }
  };
  walk(root);
  return removed;
}

export interface CloneOptions {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  dest: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Shallow clone with the token supplied via git env config, so it never lands in argv or .git/config. */
export function cloneRepo(o: CloneOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const basic = Buffer.from(`x-access-token:${o.token}`).toString("base64");
    const child = spawn(
      "git",
      ["clone", "--depth", "1", "--single-branch", "--no-tags", "--branch", o.branch, "--", `https://github.com/${o.owner}/${o.repo}.git`, o.dest],
      {
        shell: false,
        stdio: ["ignore", "ignore", "pipe"],
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          GIT_TERMINAL_PROMPT: "0",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
          GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
        } as unknown as NodeJS.ProcessEnv,
        signal: o.signal,
      },
    );
    let stderr = "";
    child.stderr.on("data", (d) => { if (stderr.length < 4000) stderr += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), o.timeoutMs ?? 300_000);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const msg = stderr.replace(o.token, "[REDACTED]").replace(basic, "[REDACTED]").trim().split("\n").pop() ?? "";
      reject(new Error(`git clone failed (exit ${code}): ${msg}`));
    });
  });
}
