import { apiError, json, requireUser } from "@/lib/api";
import { deleteCredential } from "@/lib/sources/credentials";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireUser(req, { mutating: true });
  if ("response" in r) return r.response;
  const { id } = await ctx.params;
  return deleteCredential(r.session.userId, id) ? json({ ok: true }) : apiError("Not found", 404);
}
