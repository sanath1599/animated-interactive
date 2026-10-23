import fs from "node:fs";
import { apiError, json, requireUser } from "@/lib/api";
import { getRunForUser } from "@/lib/runs/store";
import { listArtifacts, publicInfo } from "@/lib/artifacts/registry";
import { runSub } from "@/lib/runs/paths";
import { isRunId } from "@/lib/security/ids";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  const { runId } = await ctx.params;
  const run = isRunId(runId) ? getRunForUser(runId, r.session.userId) : null;
  if (!run) return apiError("Run not found", 404);
  let checks: unknown = null;
  try { checks = JSON.parse(fs.readFileSync(runSub(runId, "reports", "server-checks.json"), "utf8")); } catch { /* not produced yet */ }
  return json({ artifacts: listArtifacts(runId).map(publicInfo), checks });
}
