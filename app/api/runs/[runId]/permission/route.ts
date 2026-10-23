import { z } from "zod";
import { apiError, json, requireUser } from "@/lib/api";
import { getRunForUser } from "@/lib/runs/store";
import { respondToPermission } from "@/lib/runs/manager";
import { isRunId } from "@/lib/security/ids";

export const runtime = "nodejs";
const body = z.object({ requestId: z.string().uuid(), allow: z.boolean() });

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const r = await requireUser(req, { mutating: true });
  if ("response" in r) return r.response;
  const { runId } = await ctx.params;
  const run = isRunId(runId) ? getRunForUser(runId, r.session.userId) : null;
  if (!run) return apiError("Run not found", 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid request", 400);
  return respondToPermission(runId, parsed.data.requestId, parsed.data.allow) ? json({ ok: true }) : apiError("No such pending request", 404);
}
