import { z } from "zod";
import { isBranchName, isOwner, isRepoName } from "@/lib/security/ids";

export const MAX_TITLE = 120;
export const MAX_DETAILS = 8000;
export const MAX_PASTED_DATA = 100_000;

export const ALLOWED_UPLOAD_EXT = [
  "csv", "json", "txt", "md", "xlsx", "png", "jpg", "jpeg", "webp", "gif",
] as const;
export const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export const createRunSchema = z.object({
  owner: z.string().refine(isOwner, "Invalid repository owner"),
  repo: z.string().refine(isRepoName, "Invalid repository name"),
  branch: z.string().refine(isBranchName, "Invalid branch name").optional(),
  installationId: z.coerce.number().int().nonnegative(),
  title: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Presentation title is required").max(MAX_TITLE).regex(/^[^\r\n]+$/, "Title must be a single line")),
  details: z.string().max(MAX_DETAILS).optional().default(""),
  pastedData: z.string().max(MAX_PASTED_DATA).optional().default(""),
});
export type CreateRunInput = z.infer<typeof createRunSchema>;

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** Magic-byte sniffing for binary types; text types must be valid UTF-8 without NULs. */
export function validateUpload(
  name: string,
  bytes: Buffer,
  maxBytes: number,
): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = fileExtension(name);
  if (!(ALLOWED_UPLOAD_EXT as readonly string[]).includes(ext)) return { ok: false, error: `${name}: unsupported file type` };
  if (bytes.length === 0) return { ok: false, error: `${name}: file is empty` };
  if (bytes.length > maxBytes) return { ok: false, error: `${name}: exceeds ${Math.round(maxBytes / 1048576)} MB limit` };
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const checks: Record<string, boolean> = {
    png: startsWith(0x89, 0x50, 0x4e, 0x47),
    jpg: startsWith(0xff, 0xd8, 0xff),
    jpeg: startsWith(0xff, 0xd8, 0xff),
    gif: startsWith(0x47, 0x49, 0x46, 0x38),
    webp: bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP",
    xlsx: startsWith(0x50, 0x4b),
  };
  if (ext in checks) return checks[ext] ? { ok: true, ext } : { ok: false, error: `${name}: content does not match .${ext}` };
  if (bytes.includes(0)) return { ok: false, error: `${name}: not a text file` };
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: `${name}: not valid UTF-8 text` };
  }
  if (ext === "json") {
    try {
      JSON.parse(bytes.toString("utf8"));
    } catch {
      return { ok: false, error: `${name}: invalid JSON` };
    }
  }
  return { ok: true, ext };
}
