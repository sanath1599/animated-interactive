import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getConfig } from "@/lib/config";
import { NEXT_COOKIE, STATE_COOKIE, isSafeNext, safeEqual, setSession } from "@/lib/auth/session";
import { fetchGithubUser } from "@/lib/github/client";
import { saveGithubToken } from "@/lib/github/user-token";
import { upsertUser } from "@/lib/runs/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const cfg = getConfig();
  const home = (q: string) => NextResponse.redirect(`${cfg.appUrl}/app?${q}`);
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!expected || !state || !safeEqual(expected, state)) return home("auth_error=state");
  if (!code) return home("auth_error=denied");

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "demo-studio" },
    body: JSON.stringify({ client_id: cfg.github.clientId, client_secret: cfg.github.clientSecret, code, redirect_uri: `${cfg.appUrl}/api/auth/github/callback` }),
    cache: "no-store",
  });
  const tok = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!res.ok || !tok.access_token) return home("auth_error=exchange");
  const user = await fetchGithubUser(tok.access_token);
  upsertUser(user);
  const expiresAt = tok.expires_in ? Date.now() + tok.expires_in * 1000 : null;
  await setSession({
    userId: user.id, login: user.login, name: user.name, avatarUrl: user.avatarUrl,
    accessToken: tok.access_token, refreshToken: tok.refresh_token ?? null,
    expiresAt, issuedAt: Date.now(),
  });
  saveGithubToken(user.id, { accessToken: tok.access_token, refreshToken: tok.refresh_token ?? null, expiresAt });
  const next = jar.get(NEXT_COOKIE)?.value;
  jar.delete(NEXT_COOKIE);
  return NextResponse.redirect(`${cfg.appUrl}${next && isSafeNext(next) ? next : "/app"}`);
}
