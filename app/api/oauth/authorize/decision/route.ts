import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { currentSession } from "@/lib/api";
import { isSameOrigin } from "@/lib/security/origin";
import { createAuthorizationCode, issuer } from "@/lib/oauth/server";
import { openPending, redirectWith } from "@/lib/oauth/pending";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { appUrl, devAuthBypass } = getConfig();
  if (!isSameOrigin(req) && !devAuthBypass) return new Response("Cross-origin request rejected", { status: 403 });
  const session = await currentSession();
  const form = await req.formData();
  const pending = session ? openPending(String(form.get("r") ?? ""), session.userId) : null;
  if (!session || !pending) return NextResponse.redirect(`${appUrl}/connect?error=${encodeURIComponent("This request expired. Start connecting again from claude.ai.")}`, 303);
  if (form.get("decision") !== "allow") {
    return NextResponse.redirect(redirectWith(pending.redirectUri, { error: "access_denied", state: pending.state, iss: issuer() }), 303);
  }
  const code = createAuthorizationCode(pending, session.userId);
  return NextResponse.redirect(redirectWith(pending.redirectUri, { code, state: pending.state, iss: issuer() }), 303);
}
