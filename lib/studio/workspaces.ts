import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { resolveInside } from "@/lib/security/ids";
import { redact } from "@/lib/security/redact";
import { cloneRepo, sanitizeWorkspace } from "@/lib/github/clone";
import { assertRepoAccess, getCloneToken, listRepos } from "@/lib/github/client";
import { githubSessionFor } from "@/lib/github/user-token";
import { cloneGit, parseGitUrl } from "@/lib/sources/git";
import { credentialAuth, credentialForHost } from "@/lib/sources/credentials";
import { extractZip } from "@/lib/sources/archive";
import { uploadPath } from "./uploads";
import { listImages } from "./images";

export type WorkspaceSource =
  | { type: "github"; repo: string; branch?: string }
  | { type: "git"; url: string; branch?: string; credentialId?: string }
  | { type: "upload"; uploadId: string; name?: string };

export type WorkspaceStatus = "preparing" | "ready" | "failed";
export interface Workspace {
  id: string; userId: number; label: string; source: WorkspaceSource; branch: string;
  status: WorkspaceStatus; error: string | null; fileCount: number; removed: string[]; createdAt: number;
}

const WS_RE = /^ws_[a-f0-9]{24}$/;
export const isWorkspaceId = (v: unknown): v is string => typeof v === "string" && WS_RE.test(v);
const MAX_WORKSPACES_PER_USER = 12;
const TEXT_LIMIT = 200_000;

export const studioDir = (...p: string[]) => path.join(getConfig().dataDir, "studio", ...p);
export const repoDir = (id: string) => studioDir("workspaces", id, "repo");

type Row = Record<string, unknown>;
const toWs = (r: Row): Workspace => ({
  id: r.id as string, userId: r.user_id as number, label: r.label as string, source: JSON.parse(r.source as string) as WorkspaceSource,
  branch: r.branch as string, status: r.status as WorkspaceStatus, error: (r.error as string | null) ?? null,
  fileCount: r.file_count as number, removed: JSON.parse(r.removed as string) as string[], createdAt: r.created_at as number,
});

/** Owner-scoped lookup: other users' workspaces behave as missing. */
export function getWorkspace(id: string, userId: number): Workspace | null {
  if (!isWorkspaceId(id)) return null;
  const r = getDb().prepare("SELECT * FROM workspaces WHERE id=? AND user_id=?").get(id, userId) as Row | undefined;
  if (!r) return null;
  getDb().prepare("UPDATE workspaces SET used_at=? WHERE id=?").run(Date.now(), id);
  return toWs(r);
}

export function listWorkspaces(userId: number, limit = 10): Workspace[] {
  return (getDb().prepare("SELECT * FROM workspaces WHERE user_id=? ORDER BY used_at DESC LIMIT ?").all(userId, limit) as Row[]).map(toWs);
}

export function deleteWorkspace(id: string) {
  fs.rmSync(studioDir("workspaces", id), { recursive: true, force: true });
  getDb().prepare("DELETE FROM workspaces WHERE id=?").run(id);
}

/** Keeps each user's newest workspaces and drops ones unused for RETENTION_DAYS. */
export function pruneWorkspaces(userId?: number) {
  const cutoff = Date.now() - getConfig().retentionDays * 86400_000;
  const stale = getDb().prepare("SELECT id FROM workspaces WHERE used_at<?").all(cutoff) as { id: string }[];
  stale.forEach((r) => deleteWorkspace(r.id));
  if (userId !== undefined) {
    const extra = getDb().prepare("SELECT id FROM workspaces WHERE user_id=? ORDER BY used_at DESC LIMIT -1 OFFSET ?").all(userId, MAX_WORKSPACES_PER_USER) as { id: string }[];
    extra.forEach((r) => deleteWorkspace(r.id));
  }
}

function setStatus(id: string, status: WorkspaceStatus, patch: { error?: string; fileCount?: number; removed?: string[]; branch?: string } = {}) {
  getDb()
    .prepare("UPDATE workspaces SET status=?, error=?, file_count=COALESCE(?, file_count), removed=COALESCE(?, removed), branch=COALESCE(?, branch) WHERE id=?")
    .run(status, patch.error ?? null, patch.fileCount ?? null, patch.removed ? JSON.stringify(patch.removed) : null, patch.branch ?? null, id);
}

/** Resolves what will be fetched (and checks access) before any work starts, so bad input fails fast. */
async function plan(userId: number, src: WorkspaceSource): Promise<{ label: string; branch: string; fetch: (dest: string) => Promise<void> }> {
  if (src.type === "github") {
    const [owner, repo] = src.repo.split("/");
    const session = await githubSessionFor(userId);
    if (!session) throw new Error("Your GitHub sign-in on the web app has expired. Sign in again at the web app, then retry.");
    const found = (await listRepos(session)).find((r) => r.fullName.toLowerCase() === `${owner}/${repo}`.toLowerCase());
    if (!found) throw new Error("That repository is not available through the GitHub App installations you can access.");
    await assertRepoAccess(session, found.owner, found.name, found.installationId);
    const branch = src.branch || found.defaultBranch;
    return {
      label: found.fullName, branch,
      fetch: async (dest) => cloneRepo({ owner: found.owner, repo: found.name, branch, token: await getCloneToken(found.name, found.installationId), dest }),
    };
  }
  if (src.type === "git") {
    const ref = parseGitUrl(src.url);
    if (!ref) throw new Error("Unsupported repository URL. Use an https URL from Azure DevOps, GitLab or Bitbucket.");
    const found = src.credentialId ? credentialAuth(userId, src.credentialId) : credentialForHost(userId, ref.host);
    if (src.credentialId && !found) throw new Error("That saved access token was not found.");
    if (found && found.cred.host !== ref.host) throw new Error("That access token is for a different host.");
    const branch = src.branch || ref.branch || "";
    return { label: ref.label, branch: branch || "(default)", fetch: (dest) => cloneGit(ref, branch || null, found?.auth ?? null, dest) };
  }
  const file = uploadPath(userId, src.uploadId);
  if (!file) throw new Error("That upload was not found or is incomplete.");
  const name = (src.name ?? "upload").replace(/\.zip$/i, "").slice(0, 80) || "upload";
  return {
    label: name, branch: "(upload)",
    fetch: async (dest) => {
      fs.mkdirSync(dest, { recursive: true });
      if (extractZip(fs.readFileSync(file), dest) === 0) throw new Error("The archive contained no usable files.");
      fs.rmSync(file, { force: true });
    },
  };
}

export async function openWorkspace(userId: number, src: WorkspaceSource): Promise<Workspace> {
  pruneWorkspaces(userId);
  const p = await plan(userId, src);
  const id = `ws_${randomBytes(12).toString("hex")}`;
  const now = Date.now();
  getDb()
    .prepare("INSERT INTO workspaces(id,user_id,label,source,branch,status,created_at,used_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, userId, p.label, JSON.stringify(src), p.branch, "preparing", now, now);
  const dest = repoDir(id);
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  // Fetching can outlast a connector call, so it continues in the background; callers poll the status.
  void p.fetch(dest)
    .then(() => {
      const removed = sanitizeWorkspace(dest);
      setStatus(id, "ready", { fileCount: walk(dest).length, removed });
    })
    .catch((e: unknown) => {
      fs.rmSync(dest, { recursive: true, force: true });
      setStatus(id, "failed", { error: redact(e instanceof Error ? e.message : String(e)).slice(0, 500) });
    });
  return getWorkspace(id, userId)!;
}

const IGNORED = new Set(["node_modules", ".git", ".next", "dist", "build", ".venv", "venv", "__pycache__", ".turbo", ".cache", "coverage", ".idea"]);

function walk(root: string, max = 50_000): { path: string; bytes: number }[] {
  const out: { path: string; bytes: number }[] = [];
  const rec = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= max) return;
      if (ent.isSymbolicLink()) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (!IGNORED.has(ent.name)) rec(p); }
      else if (ent.isFile()) out.push({ path: path.relative(root, p).split(path.sep).join("/"), bytes: fs.statSync(p).size });
    }
  };
  if (fs.existsSync(root)) rec(root);
  return out;
}

const MANIFESTS = /^(package\.json|pyproject\.toml|requirements\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|composer\.json|Gemfile|[^/]*\.csproj|angular\.json|vite\.config\.[jt]s|next\.config\.[mjt]s|tailwind\.config\.[cmjt]s)$/i;

/** Overview handed to Claude when a workspace is ready: the tree, README and stack manifests. */
export function workspaceSummary(ws: Workspace) {
  const root = repoDir(ws.id);
  const tree = walk(root);
  const top = (re: RegExp, limit: number) => tree.filter((f) => re.test(f.path.split("/").pop() ?? "") && f.path.split("/").length <= 3).slice(0, limit);
  const readme = top(/^readme(\.md|\.markdown|\.txt)?$/i, 1)[0];
  const read = (rel: string, n: number) => readText(root, rel, n).text;
  return {
    tree: tree.slice(0, 4000),
    treeTruncated: tree.length > 4000,
    totalFiles: tree.length,
    readme: readme ? { path: readme.path, text: read(readme.path, 8000) } : null,
    manifests: tree.filter((f) => MANIFESTS.test(f.path.split("/").pop() ?? "") && f.path.split("/").length <= 4).slice(0, 12)
      .map((f) => ({ path: f.path, text: read(f.path, 4000) })),
    images: listImages(tree),
  };
}

function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function readText(root: string, rel: string, max: number): { text: string; bytes: number; truncated: boolean; binary: boolean } {
  const abs = resolveInside(root, rel);
  const st = fs.lstatSync(abs);
  if (!st.isFile()) throw new Error("Not a file");
  const fd = fs.openSync(abs, "r");
  try {
    const buf = Buffer.alloc(Math.min(st.size, max));
    fs.readSync(fd, buf, 0, buf.length, 0);
    if (isBinary(buf)) return { text: "", bytes: st.size, truncated: false, binary: true };
    return { text: buf.toString("utf8"), bytes: st.size, truncated: st.size > max, binary: false };
  } finally { fs.closeSync(fd); }
}

export function readFiles(ws: Workspace, paths: string[], maxBytesPerFile = 60_000) {
  const root = repoDir(ws.id);
  const cap = Math.min(Math.max(1000, maxBytesPerFile), TEXT_LIMIT);
  let budget = 900_000; // keep one connector response well under its size limit
  return paths.slice(0, 60).map((p) => {
    try {
      if (budget <= 0) return { path: p, error: "Response size limit reached; request this file in a later call." };
      const r = readText(root, p, Math.min(cap, budget));
      budget -= r.text.length;
      return r.binary ? { path: p, bytes: r.bytes, binary: true } : { path: p, bytes: r.bytes, truncated: r.truncated, text: r.text };
    } catch {
      return { path: p, error: "Not found" };
    }
  });
}

/** Literal-or-regex code search across text files (bounded). */
export function searchCode(ws: Workspace, pattern: string, opts: { glob?: string; regex?: boolean; maxResults?: number } = {}) {
  if (!pattern || pattern.length > 200) throw new Error("The search pattern must be 1-200 characters.");
  let re: RegExp;
  try { re = new RegExp(opts.regex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
  catch { throw new Error("Invalid regular expression."); }
  const glob = opts.glob ? new RegExp(`^${opts.glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*")}$`, "i") : null;
  const root = repoDir(ws.id);
  const max = Math.min(opts.maxResults ?? 80, 300);
  const hits: { path: string; line: number; text: string }[] = [];
  for (const f of walk(root)) {
    if (hits.length >= max) break;
    if (f.bytes > 1_000_000 || (glob && !glob.test(f.path))) continue;
    const t = readText(root, f.path, 1_000_000);
    if (t.binary) continue;
    const lines = t.text.split("\n");
    for (let i = 0; i < lines.length && hits.length < max; i++) {
      if (re.test(lines[i])) hits.push({ path: f.path, line: i + 1, text: lines[i].trim().slice(0, 240) });
    }
  }
  return { hits, truncated: hits.length >= max };
}
