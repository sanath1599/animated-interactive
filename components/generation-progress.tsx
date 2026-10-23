"use client";
import { useEffect, useRef, useState } from "react";
import { api, fmtElapsed } from "@/lib/client";
import { ProgressTimeline } from "./progress-timeline";
import type { RunRecord, RunStatus, StageId, StoredEvent } from "@/types/run";

interface Props { run: RunRecord; onFinished: (status: RunStatus, error: string | null) => void }
interface Perm { requestId: string; tool: string; summary: string }
interface LogLine { id: number; level: string; message: string }

export function GenerationProgress({ run, onFinished }: Props) {
  const [stage, setStage] = useState<StageId | null>(run.stage);
  const [status, setStatus] = useState<RunStatus>(run.status);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [perm, setPerm] = useState<Perm | null>(null);
  const [now, setNow] = useState(0);
  const [conn, setConn] = useState<"live" | "reconnecting">("live");
  const lastId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // EventSource reconnects automatically and resends Last-Event-ID; the server replays missed events.
    const es = new EventSource(`/api/runs/${run.id}/events`);
    es.onopen = () => setConn("live");
    es.onerror = () => setConn("reconnecting");
    es.addEventListener("run", (m) => {
      const e = JSON.parse((m as MessageEvent).data) as StoredEvent;
      if (e.id <= lastId.current) return;
      lastId.current = e.id;
      const ev = e.event;
      if (ev.type === "stage") setStage(ev.stage);
      else if (ev.type === "log") setLines((l) => [...l.slice(-300), { id: e.id, level: ev.level, message: ev.message }]);
      else if (ev.type === "permission_request") setPerm({ requestId: ev.requestId, tool: ev.tool, summary: ev.summary });
      else if (ev.type === "permission_resolved") setPerm(null);
      else if (ev.type === "status") {
        setStatus(ev.status);
        if (ev.status !== "running" && ev.status !== "queued") { es.close(); onFinished(ev.status, ev.error ?? null); }
      }
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  useEffect(() => { const tick = () => setNow(Date.now()); const t = setInterval(tick, 1000); const first = setTimeout(tick, 0); return () => { clearInterval(t); clearTimeout(first); }; }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [lines]);

  const active = status === "queued" || status === "running";
  async function cancel() { await api(`/api/runs/${run.id}/cancel`, { method: "POST" }).catch(() => {}); }
  async function answer(allow: boolean) {
    if (!perm) return;
    await api(`/api/runs/${run.id}/permission`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: perm.requestId, allow }) }).catch(() => {});
    setPerm(null);
  }

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <p className="eyebrow">{run.owner}/{run.repo} · <span className="mono">{run.branch}</span></p>
          <h2>{run.title}</h2>
        </div>
        <div className="row">
          <span className="chip mono" aria-label="Elapsed time">{now ? fmtElapsed(now - (run.startedAt ?? run.createdAt)) : "0:00"}</span>
          {active && <button className="btn danger" onClick={cancel}>Cancel</button>}
        </div>
      </div>
      {status === "queued" && <div className="notice">Waiting for a free generator slot…</div>}
      {conn === "reconnecting" && active && <div className="notice warn" role="status">Reconnecting to live progress…</div>}
      {perm && (
        <div className="notice warn" role="alertdialog" aria-labelledby="perm-t">
          <strong id="perm-t">Claude is asking for permission</strong>
          <p className="small">{perm.summary}</p>
          <p className="hint">This runs inside the isolated sandbox for this demo only. If unsure, deny — Claude will continue without it.</p>
          <div className="row"><button className="btn primary" onClick={() => answer(true)}>Allow once</button><button className="btn" onClick={() => answer(false)}>Deny</button></div>
        </div>
      )}
      <div className="cols">
        <div className="card"><ProgressTimeline current={stage} finished={status === "succeeded"} /></div>
        <div className="card">
          <p className="eyebrow">Activity</p>
          <div className="log" ref={logRef} role="log" aria-live="polite">
            {lines.length === 0 && <div className="muted">Waiting for the first event…</div>}
            {lines.map((l) => <div key={l.id} className={l.level}>{l.message}</div>)}
          </div>
          <p className="hint">Progress reflects real events from the run. Stages advance only when the work actually starts.</p>
        </div>
      </div>
    </div>
  );
}
