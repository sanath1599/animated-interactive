import { apiError, json, requireUser } from "@/lib/api";
import { ARCHIVE_LIMITS } from "@/lib/sources/archive";
import { uploadWhole } from "@/lib/studio/uploads";

export const runtime = "nodejs";

/** A zipped project folder from the dashboard, sent as the raw request body. Returns the uploadId to build from. */
export async function POST(req: Request) {
  const r = await requireUser(req, { mutating: true });
  if ("response" in r) return r.response;
  const name = (new URL(req.url).searchParams.get("name") ?? "project.zip").replace(/[^\w .()-]+/g, "_").slice(0, 120) || "project.zip";
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > ARCHIVE_LIMITS.maxArchiveBytes) return apiError("The archive is larger than 100 MB.", 413);
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return apiError("The archive is empty.", 400);
  if (buf.length > ARCHIVE_LIMITS.maxArchiveBytes) return apiError("The archive is larger than 100 MB.", 413);
  try {
    return json({ uploadId: uploadWhole(r.session.userId, name, buf.toString("base64")), name, bytes: buf.length }, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Could not store the archive.", 400);
  }
}
