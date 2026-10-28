import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getConfig } from "@/lib/config";
import { NEXT_COOKIE, STATE_COOKIE, cookieOptions, isSafeNext } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const cfg = getConfig();
  if (!cfg.github.clientId) return NextResponse.redirect(`${cfg.appUrl}/app?auth_error=not_configured`);
  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, cookieOptions(600));
  const next = new URL(req.url).searchParams.get("next");
  if (next && isSafeNext(next)) jar.set(NEXT_COOKIE, next, cookieOptions(600));
  else jar.delete(NEXT_COOKIE);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", cfg.github.clientId);
  url.searchParams.set("redirect_uri", `${cfg.appUrl}/api/auth/github/callback`);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
