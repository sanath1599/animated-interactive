import fs from "node:fs";
import path from "node:path";
import { getSample } from "@/lib/samples";

export const runtime = "nodejs";

// Sample HTML is generated content, so it is served with the same strict sandbox policy as run artifacts.
const CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'self'";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const sample = getSample(slug);
  if (!sample) return new Response("Not found", { status: 404 });
  const file = path.join(process.cwd(), "samples", `${sample.slug}.html`);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300" };
  if (new URL(req.url).searchParams.get("download") === "1") headers["Content-Disposition"] = `attachment; filename="${sample.slug}.html"`;
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers });
}
