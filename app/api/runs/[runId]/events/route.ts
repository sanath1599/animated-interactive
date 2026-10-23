import { apiError, requireUser } from "@/lib/api";
import { eventsAfter, getRun, getRunForUser, subscribe } from "@/lib/runs/store";
import { isTerminal } from "@/lib/runs/state-machine";
import { isRunId } from "@/lib/security/ids";
import type { StoredEvent } from "@/types/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events with replay: reconnecting clients send Last-Event-ID (or ?after=) and receive missed events first. */
export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  const { runId } = await ctx.params;
  const run = isRunId(runId) ? getRunForUser(runId, r.session.userId) : null;
  if (!run) return apiError("Run not found", 404);

  const header = req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("after") ?? "0";
  let last = Math.max(0, parseInt(header, 10) || 0);
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (e: StoredEvent) => {
        if (closed || e.id <= last) return;
        last = e.id;
        controller.enqueue(enc.encode(`id: ${e.id}\nevent: run\ndata: ${JSON.stringify(e)}\n\n`));
        if (e.event.type === "status" && isTerminal(e.event.status)) setTimeout(close, 50);
      };
      const close = () => { if (!closed) { closed = true; cleanup(); try { controller.close(); } catch { /* already closed */ } } };
      const buffered: StoredEvent[] = [];
      let replaying = true;
      const unsub = subscribe(runId, (e) => (replaying ? buffered.push(e) : send(e)));
      const hb = setInterval(() => { if (!closed) controller.enqueue(enc.encode(": ping\n\n")); }, 15000);
      cleanup = () => { unsub(); clearInterval(hb); };
      controller.enqueue(enc.encode("retry: 2000\n\n"));
      for (const e of eventsAfter(runId, last)) send(e);
      replaying = false;
      buffered.forEach(send);
      const cur = getRun(runId);
      if (cur && isTerminal(cur.status) && last >= (eventsAfter(runId, last).at(-1)?.id ?? last)) setTimeout(close, 50);
      req.signal.addEventListener("abort", close);
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
