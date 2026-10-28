import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { currentSession } from "@/lib/api";
import { OAuthError, issuer, validateAuthorizeRequest } from "@/lib/oauth/server";
import { redirectWith, sealPending } from "@/lib/oauth/pending";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { appUrl } = getConfig();
  const url = new URL(req.url);
  let v: ReturnType<typeof validateAuthorizeRequest>;
  try {
    v = validateAuthorizeRequest(url.searchParams);
  } catch (e) {
    const msg = e instanceof OAuthError ? e.message : "Invalid authorization request.";
    return NextResponse.redirect(`${appUrl}/connect?error=${encodeURIComponent(msg)}`);
  }
  if ("redirectError" in v) return NextResponse.redirect(redirectWith(v.redirectUri, { error: v.redirectError, state: v.state, iss: issuer() }));

  const session = await currentSession();
  if (!session) {
    const back = `/api/oauth/authorize?${url.searchParams.toString()}`;
    return NextResponse.redirect(`${appUrl}/api/auth/github/login?next=${encodeURIComponent(back)}`);
  }
  return NextResponse.redirect(`${appUrl}/connect?r=${encodeURIComponent(sealPending(v, session.userId))}`);
}
