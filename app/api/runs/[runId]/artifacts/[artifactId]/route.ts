import fs from "node:fs";
import { apiError, requireUser } from "@/lib/api";
import { getRunForUser } from "@/lib/runs/store";
import { findArtifact } from "@/lib/artifacts/registry";
import { isRunId } from "@/lib/security/ids";

export const runtime = "nodejs";

// Generated HTML is untrusted. `sandbox` in CSP gives it an opaque origin even if opened directly,
// so it cannot read this site's cookies or call its APIs; connect/frame/form are blocked as well.
const HTML_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'self'";

export async function GET(req: Request, ctx: { params: Promise<{ runId: string; artifactId: string }> }) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  const { runId, artifactId } = await ctx.params;
  const run = isRunId(runId) ? getRunForUser(runId, r.session.userId) : null;
  if (!run) return apiError("Not found", 404);
  const art = findArtifact(runId, artifactId);
  if (!art) return apiError("Not found", 404);

  const download = new URL(req.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": art.contentType,
    "Content-Length": String(art.size),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };
  if (art.kind === "html") headers["Content-Security-Policy"] = HTML_CSP;
  else if (art.contentType.startsWith("text/") || art.contentType === "application/json") headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
  if (download) headers["Content-Disposition"] = `attachment; filename="${art.name.replace(/[^A-Za-z0-9._-]/g, "_")}"`;

  const buf = fs.readFileSync(art.abs);
  return new Response(new Uint8Array(buf), { headers });
}
