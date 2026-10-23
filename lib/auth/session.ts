import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getConfig } from "@/lib/config";

export interface Session {
  userId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  issuedAt: number;
}

export const SESSION_COOKIE = "ds_session";
export const STATE_COOKIE = "ds_oauth_state";
const MAX_AGE_S = 60 * 60 * 24 * 7;

function key(): Buffer {
  const secret = getConfig().sessionSecret;
  if (secret.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return createHash("sha256").update(secret).digest();
}

export function seal(data: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

export function unseal<T>(value: string): T | null {
  try {
    const buf = Buffer.from(value, "base64url");
    if (buf.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const cookieOptions = (maxAge = MAX_AGE_S) => ({
  httpOnly: true,
  secure: getConfig().appUrl.startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  const s = raw ? unseal<Session>(raw) : null;
  if (!s || Date.now() - s.issuedAt > MAX_AGE_S * 1000) return null;
  return s;
}

export async function setSession(s: Session) {
  (await cookies()).set(SESSION_COOKIE, seal(s), cookieOptions());
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
