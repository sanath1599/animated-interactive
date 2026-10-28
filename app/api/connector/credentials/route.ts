import { apiError, json, requireUser } from "@/lib/api";
import { addCredential } from "@/lib/sources/credentials";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const r = await requireUser(req, { mutating: true });
  if ("response" in r) return r.response;
  const b = (await req.json().catch(() => ({}))) as { host?: unknown; label?: unknown; username?: unknown; token?: unknown };
  if (typeof b.host !== "string" || typeof b.token !== "string") return apiError("Host and token are required.", 400);
  try {
    const cred = addCredential(r.session.userId, {
      host: b.host, token: b.token,
      label: typeof b.label === "string" ? b.label : undefined,
      username: typeof b.username === "string" ? b.username : undefined,
    });
    return json({ credential: cred }, 201);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Could not save the token.", 400);
  }
}
