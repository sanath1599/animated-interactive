import { OAuthError, exchangeToken, pruneOAuth } from "@/lib/oauth/server";

export const runtime = "nodejs";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type, Authorization" };

export async function POST(req: Request) {
  pruneOAuth();
  const type = req.headers.get("content-type") ?? "";
  const form = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>))
    : new URLSearchParams(await req.text());
  // Clients registered as public may still identify themselves with HTTP Basic (client_id:secret); the secret is ignored.
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (basic && !form.get("client_id")) {
    const id = Buffer.from(basic[1], "base64").toString("utf8").split(":")[0];
    let client = "";
    try { client = decodeURIComponent(id); } catch { /* malformed: left unset, so the request fails as invalid_client */ }
    if (client) form.set("client_id", client);
  }
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
