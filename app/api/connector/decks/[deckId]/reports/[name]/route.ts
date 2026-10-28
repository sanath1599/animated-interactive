import { apiError, requireUser } from "@/lib/api";
import { REPORT_NAMES, deckReports, getDeck } from "@/lib/studio/decks";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ deckId: string; name: string }> }) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  const { deckId, name } = await ctx.params;
  const deck = getDeck(deckId, r.session.userId);
  const text = deck && (REPORT_NAMES as readonly string[]).includes(name) ? deckReports(deck.id)[name] : undefined;
  if (text === undefined) return apiError("Not found", 404);
  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8", "Content-Security-Policy": "sandbox; default-src 'none'", "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
