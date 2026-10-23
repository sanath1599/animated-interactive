import { apiError, json, requireUser } from "@/lib/api";
import { getRunForUser } from "@/lib/runs/store";
import { cancelRun } from "@/lib/runs/manager";
import { isRunId } from "@/lib/security/ids";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const r = await requireUser(req, { mutating: true });
  if ("response" in r) return r.response;
  const { runId } = await ctx.params;
  const run = isRunId(runId) ? getRunForUser(runId, r.session.userId) : null;
  if (!run) return apiError("Run not found", 404);
  return cancelRun(runId) ? json({ ok: true }) : apiError("This run is not active.", 409);
}
