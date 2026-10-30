import fs from "node:fs";
import path from "node:path";
import { resolveInside } from "@/lib/security/ids";

/**
 * The repository's own images: listed for Claude (public/ first), shown to it with view_images, and
 * embedded into decks. Generated markup refers to an image as `repo:<path>` (or as the app does, `/logo.png`
 * for a file in public/); saving a deck replaces those references with data: URIs, since a deck is one
 * offline file.
 */
export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
};
/** Types Claude can look at directly (view_images); SVG is text and is read with read_files. */
export const VIEWABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|ico|bmp)$/i;
/** Folders frameworks serve from the site root: Next.js/Vite/CRA public/, SvelteKit static/. */
const WEB_ROOTS = ["public", "static", "app/public", "client/public", "frontend/public", "web/public", "src/public", "src/static", "assets"];
const MAX_ONE = 1_500_000;
const SIZE_LIMIT = "the deck's size limit was reached";
const TRANSPARENT = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const mimeOf = (p: string) => IMAGE_TYPES[(p.split(".").pop() ?? "").toLowerCase()] ?? null;

/** Image files in a tree, most useful first: web-root folders, then asset folders, then screenshots and docs. */
export function listImages(tree: { path: string; bytes: number }[], limit = 150) {
  const rank = (p: string) => {
    const l = p.toLowerCase();
    if (/(^|\/)(public|static)\//.test(l)) return 0;
    if (/(^|\/)(assets|images|img|icons|logos?|brand)\//.test(l)) return 1;
    if (/screenshot|mockup|preview|design|figma|ui[-_]|docs?\//.test(l)) return 2;
    return 3;
  };
  return tree.filter((f) => IMAGE_RE.test(f.path) && f.bytes > 0)
    .map((f) => ({ ...f, rank: rank(f.path) }))
    .sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map(({ path: p, bytes }) => ({ path: p, bytes }));
}

/** Reads one image inside the repository (at most `max` bytes), or explains why not. */
export function readImage(root: string, rel: string, max = MAX_ONE): { data: Buffer; mime: string } | { error: string } {
  const clean = rel.replace(/^\.?\/+/, "").split(/[?#]/)[0];
  const mime = mimeOf(clean);
  if (!mime) return { error: "not an image" };
  let abs: string;
  try { abs = resolveInside(root, clean); } catch { return { error: "outside the repository" }; }
  if (!fs.existsSync(abs)) return { error: "not found" };
  const st = fs.lstatSync(abs);
  if (!st.isFile()) return { error: "not found" };
  if (st.size > MAX_ONE) return { error: `larger than ${MAX_ONE / 1_000_000} MB` };
  if (st.size > max) return { error: SIZE_LIMIT };
  return { data: fs.readFileSync(abs), mime };
}

/** Candidate repository paths for a reference found in markup or CSS. */
function candidates(ref: string): string[] | null {
  const r = ref.trim();
  if (/^repo:/i.test(r)) return [r.slice(5)];
  // A root path such as /logo.png is how apps refer to files in their public folder.
  if (/^\/(?!\/)/.test(r) && IMAGE_RE.test(r.split(/[?#]/)[0])) return [...WEB_ROOTS.map((d) => `${d}${r}`), r.slice(1)];
  return null;
}

export interface InlineReport { inlined: string[]; bytes: number; missing: { ref: string; reason: string }[] }

/**
 * Replaces repository image references in deck HTML with data: URIs, within `budget` bytes of output.
 * References that can't be resolved become a transparent pixel so nothing tries the network. With no `root`
 * (the workspace is gone) every reference is reported missing.
 */
export function inlineImages(html: string, root: string | null, budget: number): { html: string; report: InlineReport } {
  const files = new Map<string, { uri: string; path: string } | { error: string }>(); // per reference, read once
  const report: InlineReport = { inlined: [], bytes: 0, missing: [] };
  const miss = (ref: string, reason: string) => { if (!report.missing.some((m) => m.ref === ref)) report.missing.push({ ref, reason }); return TRANSPARENT; };
  const resolve = (ref: string): string | null => {
    const paths = candidates(ref);
    if (!paths) return null; // not ours to touch
    if (!files.has(ref)) {
      let found: { uri: string; path: string } | { error: string } = { error: root ? "not found" : "the repository is no longer open for this demo" };
      // Base64 grows a file by a third, so nothing larger than what's left of the budget is read.
      const room = Math.floor(Math.max(0, budget - report.bytes) * 3 / 4);
      for (const p of root ? paths : []) {
        const img = readImage(root!, p, room);
        if ("error" in img) { if (img.error !== "not found") { found = img; break; } continue; }
        found = { uri: `data:${img.mime};base64,${img.data.toString("base64")}`, path: path.posix.normalize(p.replace(/^\.?\/+/, "").split(/[?#]/)[0]) };
        break;
      }
      files.set(ref, found);
    }
    const f = files.get(ref)!;
    if ("error" in f) return miss(ref, f.error);
    // Every occurrence is a full copy in the output, so each one counts against the budget.
    if (report.bytes + f.uri.length > budget) return miss(ref, SIZE_LIMIT);
    report.bytes += f.uri.length;
    if (!report.inlined.includes(f.path)) report.inlined.push(f.path);
    return f.uri;
  };
  const out = html
    // The quote may be JSON-escaped (\") inside the deck's data block, where the logo lives.
    .replace(/(\s(?:src|href|xlink:href|poster)\s*=\s*)(\\?["'])([^"'\\]+)\2/gi, (m, pre, q, ref) => { const u = resolve(ref); return u ? `${pre}${q}${u}${q}` : m; })
    .replace(/(\ssrcset\s*=\s*)(["'])([^"']+)\2/gi, (m, pre, q, set: string) => `${pre}${q}${set.split(",").map((part) => {
      const [ref, ...desc] = part.trim().split(/\s+/);
      const u = resolve(ref);
      return [u ?? ref, ...desc].join(" ");
    }).join(", ")}${q}`)
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, ref) => { const u = resolve(ref); return u ? `url(${q || '"'}${u}${q || '"'})` : m; });
  return { html: out, report };
}
