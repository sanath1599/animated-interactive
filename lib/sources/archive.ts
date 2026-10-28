import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

export const ARCHIVE_LIMITS = {
  maxArchiveBytes: 100 * 1024 * 1024,
  maxEntries: 20_000,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 400 * 1024 * 1024,
};

const SKIP_DIRS = /(^|\/)(node_modules|\.git|\.next|dist|build|\.venv|venv|__pycache__|\.turbo|\.cache|coverage)(\/|$)/;

/** Normalises an entry name; null when it is absolute, escapes the root, or names a directory. */
export function safeEntryName(name: string): string | null {
  const n = name.replace(/\\/g, "/");
  if (n.endsWith("/") || n.startsWith("/") || /^[A-Za-z]:/.test(n)) return null;
  const parts = n.split("/").filter((p) => p && p !== ".");
  if (!parts.length || parts.some((p) => p === ".." || p.includes("\0"))) return null;
  return parts.join("/");
}

/**
 * Extracts a zip into `dest`. Entry names are validated (no absolute paths or `..`), dependency and
 * build folders are skipped, and sizes are bounded before anything is inflated. A single top-level
 * folder (the usual "repo-main/") is stripped. Returns the number of files written.
 */
export function extractZip(buf: Uint8Array, dest: string): number {
  if (buf.byteLength > ARCHIVE_LIMITS.maxArchiveBytes) throw new Error("The archive is larger than 100 MB.");
  let entries = 0;
  let total = 0;
  const files = unzipSync(buf, {
    filter: (f) => {
      const name = safeEntryName(f.name);
      if (!name || SKIP_DIRS.test(name)) return false;
      if (++entries > ARCHIVE_LIMITS.maxEntries) throw new Error("The archive has too many files.");
      if (f.originalSize > ARCHIVE_LIMITS.maxFileBytes) return false; // large binaries are not useful for analysis
      total += f.originalSize;
      if (total > ARCHIVE_LIMITS.maxTotalBytes) throw new Error("The archive expands to more than 400 MB.");
      return true;
    },
  });
  const names = Object.keys(files).map((n) => safeEntryName(n)!).filter(Boolean);
  const tops = new Set(names.map((n) => n.split("/")[0]));
  const strip = tops.size === 1 && names.every((n) => n.includes("/")) ? `${[...tops][0]}/` : "";
  const root = path.resolve(dest);
  let written = 0;
  for (const [raw, data] of Object.entries(files)) {
    const name = safeEntryName(raw);
    if (!name || data.byteLength > ARCHIVE_LIMITS.maxFileBytes) continue;
    const rel = strip && name.startsWith(strip) ? name.slice(strip.length) : name;
    const target = path.resolve(root, rel);
    if (!target.startsWith(root + path.sep)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data, { mode: 0o600 });
    written++;
  }
  return written;
}
