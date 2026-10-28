import { OAuthError, exchangeToken, pruneOAuth } from "@/lib/oauth/server";

export const runtime = "nodejs";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type, Authorization" };

export async function POST(req: Request) {
  pruneOAuth();
  const type = req.headers.get("content-type") ?? "";
  const form = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>))
    : new URLSearchParams(await req.text());
  try {
    return Response.json(exchangeToken(form), { headers: { "Cache-Control": "no-store", Pragma: "no-cache", ...CORS } });
  } catch (e) {
    const err = e instanceof OAuthError ? e : new OAuthError("invalid_request", "Token request failed");
    return Response.json({ error: err.code, error_description: err.message }, { status: err.status, headers: { "Cache-Control": "no-store", ...CORS } });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
