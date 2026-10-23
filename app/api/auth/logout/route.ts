import { clearSession } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { apiError, json } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return apiError("Cross-origin request rejected", 403);
  await clearSession();
  return json({ ok: true });
}
