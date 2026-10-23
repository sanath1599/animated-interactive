import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";

const RUN_ID_RE = /^run_[a-f0-9]{24}$/;
const ARTIFACT_ID_RE = /^[a-z0-9]{3,32}$/;
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;
const BRANCH_RE = /^(?!\/|.*(?:\/\/|\.\.|@\{|\\))[A-Za-z0-9._\-/]{1,200}(?<![/.]|\.lock)$/;

export const newRunId = () => `run_${randomBytes(12).toString("hex")}`;
export const isRunId = (v: unknown): v is string => typeof v === "string" && RUN_ID_RE.test(v);
export const isArtifactId = (v: unknown): v is string => typeof v === "string" && ARTIFACT_ID_RE.test(v);
export const isOwner = (v: unknown): v is string => typeof v === "string" && OWNER_RE.test(v);
export const isRepoName = (v: unknown): v is string => typeof v === "string" && REPO_RE.test(v);
export const isBranchName = (v: unknown): v is string =>
  typeof v === "string" && BRANCH_RE.test(v) && !v.startsWith("-");

/** Parse "owner/repo" or a github.com URL into validated parts. */
export function parseRepoRef(input: string): { owner: string; repo: string } | null {
  const s = input.trim();
  let owner: string | undefined;
  let repo: string | undefined;
  const url = /^(?:https:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?\/?(?:[?#].*)?$/i.exec(s);
  if (url) [, owner, repo] = url;
  else {
    const short = /^([^/\s]+)\/([^/\s]+)$/.exec(s);
    if (short) [, owner, repo] = short;
  }
  if (!owner || !repo) return null;
  repo = repo.replace(/\.git$/i, "");
  return isOwner(owner) && isRepoName(repo) ? { owner, repo } : null;
}

/** Reduce an arbitrary upload name to a safe basename. */
export function safeFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/")).normalize("NFKC");
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 100);
  return cleaned || "file";
}

export function slugify(title: string, max = 60): string {
  const s = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
  return s || "demo";
}

/** Resolve `child` under `root`; throws if it escapes (including via symlinks when the path exists). */
export function resolveInside(root: string, ...child: string[]): string {
  const rootReal = fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root);
  const target = path.resolve(rootReal, ...child);
  const real = fs.existsSync(target) ? fs.realpathSync(target) : target;
  const rel = path.relative(rootReal, real);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error("Path escapes the permitted directory");
  }
  return real;
}
