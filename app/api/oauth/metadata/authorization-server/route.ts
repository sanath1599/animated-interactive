import { authorizationServerMetadata } from "@/lib/oauth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Served at /.well-known/oauth-authorization-server (RFC 8414) via a rewrite in next.config.ts.
export function GET() {
  return Response.json(authorizationServerMetadata(), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
