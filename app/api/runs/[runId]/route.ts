import { apiError, json, requireUser } from "@/lib/api";
import { getRunForUser } from "@/lib/runs/store";
import { isRunId } from "@/lib/security/ids";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  const { runId } = await ctx.params;
  const run = isRunId(runId) ? getRunForUser(runId, r.session.userId) : null;
  return run ? json({ run }) : apiError("Run not found", 404);
}
