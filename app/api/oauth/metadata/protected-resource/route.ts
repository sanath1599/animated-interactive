import { protectedResourceMetadata } from "@/lib/oauth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Served at /.well-known/oauth-protected-resource[/api/mcp] (RFC 9728) via a rewrite in next.config.ts.
export function GET() {
  return Response.json(protectedResourceMetadata(), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
