import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getConfig } from "@/lib/config";
import { STATE_COOKIE, cookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const cfg = getConfig();
  if (!cfg.github.clientId) return NextResponse.redirect(`${cfg.appUrl}/app?auth_error=not_configured`);
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, cookieOptions(600));
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", cfg.github.clientId);
  url.searchParams.set("redirect_uri", `${cfg.appUrl}/api/auth/github/callback`);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
