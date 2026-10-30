import { OAuthError, registerClient } from "@/lib/oauth/server";

export const runtime = "nodejs";

// Dynamic client registration (RFC 7591) for public clients such as the claude.ai and ChatGPT connectors.
export async function POST(req: Request) {
  try {
    const c = registerClient(await req.json().catch(() => null));
    return Response.json({
      client_id: c.id, client_name: c.name, redirect_uris: c.redirectUris, client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    }, { status: 201, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    const err = e instanceof OAuthError ? e : new OAuthError("invalid_client_metadata", "Registration failed");
    return Response.json({ error: err.code, error_description: err.message }, { status: err.status, headers: { "Access-Control-Allow-Origin": "*" } });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
}
