import { revokeToken } from "@/lib/oauth/server";

export const runtime = "nodejs";

// RFC 7009: always 200, whether or not the token existed.
export async function POST(req: Request) {
  const form = new URLSearchParams(await req.text());
  const t = form.get("token");
  if (t) revokeToken(t);
  return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
}
