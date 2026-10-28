import { apiError, json, requireUser } from "@/lib/api";
import { deckFileName, deckHtml, deleteDeck, getDeck } from "@/lib/studio/decks";

export const runtime = "nodejs";

// Same policy as run artifacts: generated HTML is untrusted and gets an opaque origin with no network.
const HTML_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'self'";

export async function GET(req: Request, ctx: { params: Promise<{ deckId: string }> }) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  const { deckId } = await ctx.params;
  const deck = getDeck(deckId, r.session.userId);
  const html = deck ? deckHtml(deck.id) : null;
  if (!deck || html === null) return apiError("Not found", 404);
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": HTML_CSP,
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
  };
  if (new URL(req.url).searchParams.get("download") === "1") headers["Content-Disposition"] = `attachment; filename="${deckFileName(deck)}"`;
  return new Response(html, { headers });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ deckId: string }> }) {
  const r = await requireUser(req, { mutating: true });
  if ("response" in r) return r.response;
  const { deckId } = await ctx.params;
  return deleteDeck(deckId, r.session.userId) ? json({ ok: true }) : apiError("Not found", 404);
}
