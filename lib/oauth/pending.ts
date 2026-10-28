import { seal, unseal } from "@/lib/auth/session";
import type { AuthorizeRequest } from "./server";

/** An authorization request waiting for the user's consent, sealed so the consent page can't be tampered with. */
interface Pending { req: AuthorizeRequest; userId: number; exp: number }
const TTL_MS = 10 * 60_000;

export const sealPending = (req: AuthorizeRequest, userId: number) => seal({ req, userId, exp: Date.now() + TTL_MS } satisfies Pending);

export function openPending(value: string | null | undefined, userId: number): AuthorizeRequest | null {
  const p = value ? unseal<Pending>(value) : null;
  return p && p.userId === userId && p.exp > Date.now() ? p.req : null;
}

export function redirectWith(uri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}
