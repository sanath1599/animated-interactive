import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getConfig } from "@/lib/config";
import { verifyAccessToken } from "@/lib/oauth/server";
import { createStudioServer } from "@/lib/studio/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 401 that tells MCP clients where to discover the authorization server (RFC 9728). */
function unauthorized(error = "invalid_token") {
  const meta = `${getConfig().appUrl}/.well-known/oauth-protected-resource/api/mcp`;
  return new Response(JSON.stringify({ error, error_description: "Sign in to connect Animated Technical Interactive." }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${meta}", error="${error}"`, "Cache-Control": "no-store" },
  });
}

async function handle(req: Request): Promise<Response> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  const grant = m ? verifyAccessToken(m[1]) : null;
  if (!grant) return unauthorized(m ? "invalid_token" : "invalid_request");

  // Stateless: one server and transport per request, bound to the token's user.
  const server = createStudioServer(grant.userId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 26 * 1024 * 1024 });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req, { authInfo: { token: grant.token, clientId: grant.clientId, scopes: grant.scopes, expiresAt: grant.expiresAt } });
  } finally {
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
