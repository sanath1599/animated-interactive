import os from "node:os";
import { getConfig } from "@/lib/config";
import { getSession, type Session } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { upsertUser } from "@/lib/runs/store";
import { bootstrap } from "@/lib/runs/manager";

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
export const apiError = (message: string, status: number) => json({ error: message }, status);

const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/** Resolves the signed-in user or an error Response. Mutating requests must also pass the same-origin check. */
export async function requireUser(req: Request, opts: { mutating?: boolean } = {}): Promise<{ session: Session } | { response: Response }> {
  bootstrap();
  const dev = getConfig().devAuthBypass;
  if (opts.mutating && !isSameOrigin(req)) {
    const origin = req.headers.get("origin") ?? "";
    if (!(dev && LOCAL_ORIGIN.test(origin))) return { response: apiError("Cross-origin request rejected", 403) };
  }
  const session = await currentSession();
  if (!session) return { response: apiError("Not signed in", 401) };
  return { session };
}

/** The signed-in user from the session cookie, or the local developer in dev-bypass mode. */
export async function currentSession(): Promise<Session | null> {
  const session = await getSession();
  if (session || !getConfig().devAuthBypass) return session;
  const login = os.userInfo().username;
  upsertUser({ id: 1, login, name: login, avatarUrl: null });
  return { userId: 1, login, name: login, avatarUrl: null, accessToken: "", refreshToken: null, expiresAt: null, issuedAt: Date.now() };
}
