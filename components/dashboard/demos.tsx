"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Frame, Loading, SignedOutGate } from "./frame";
import { Markdown } from "./markdown";
import { NewDemo } from "./new-demo";
import { fmtTokens } from "./usage-chart";
import { ago, dur, useDashboard, type Generation, type Status } from "./use-dashboard";

const ASSISTANT = { claude: "Claude", chatgpt: "ChatGPT" } as const;

const STATUS: Record<Status, { label: string; tone: string }> = {
  completed: { label: "Ready", tone: "ok" }, running: { label: "Building", tone: "run" }, failed: { label: "Failed", tone: "bad" },
  stopped: { label: "Stopped", tone: "" }, interrupted: { label: "Interrupted", tone: "bad" },
};
const REPORTS = { "verification-report.md": "Verification report", "evidence-report.md": "Evidence report" } as const;
type ReportName = keyof typeof REPORTS;

const PHASE: Record<string, string> = {
  queued: "Waiting for the request to be sent in the chat", read: "Reading the code", plan: "Planning the slides", foundation: "Copying the product's styles",
  screens: "Rebuilding the screens", verify: "Checking every slide in a browser", review: "Reviewing the screens", report: "Writing the reports",
};

/** The home page once set up: start a demo, follow its progress, open what's finished. New users go to setup first. */
export function Demos({ focusDeck }: { focusDeck?: string }) {
  const { data, signedOut, error, setError, load, connected } = useDashboard();
  const [preview, setPreview] = useState<string | null>(focusDeck ?? null);
  const router = useRouter();
  useEffect(() => { if (data && !connected) router.replace("/dashboard/setup"); }, [data, connected, router]);
  if (signedOut) return <SignedOutGate />;

  async function deleteDeck(id: string) {
    setError(null);
    try { await api(`/api/connector/decks/${id}`, { method: "DELETE" }); await load(); } catch (err) { setError((err as Error).message); }
  }
  // A deck can have several generations (build, resume, revisions); its actions go on the newest one.
  const deckOwner = new Map<string, string>();
  for (const x of data?.generations ?? []) if (x.deckId && x.deckAvailable && !deckOwner.has(x.deckId)) deckOwner.set(x.deckId, x.id);

  return (
    <Frame page="demos" data={data}>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {!data || !connected ? <Loading /> : (
        <>
          {data.github.installUrl && data.github.installations === 0 && (
            <div className="notice warn dl-install" role="status">
              <span>The antm GitHub App can&apos;t read any of your repositories yet.</span>
              <a className="btn sm primary" href={data.github.installUrl} target="_blank" rel="noreferrer">Choose repositories on GitHub</a>
            </div>
          )}
          <NewDemo credentials={data.credentials} connected={data.connector.assistants} onCreated={load} />
          <section className="dl" aria-labelledby="dl-h">
            <h2 id="dl-h" className="dx-h2">Your demos</h2>
            {data.generations.length === 0
              ? <p className="muted">Nothing yet. The demos you start above appear here, with their progress while the assistant works.</p>
              : (
                <ul className="dl-list">
                  {data.generations.map((x) => (
                    <Row key={x.id} x={x} owns={Boolean(x.deckId && deckOwner.get(x.deckId) === x.id)} open={preview === x.deckId}
                      onPreview={() => setPreview(preview === x.deckId ? null : x.deckId)} onDelete={() => deleteDeck(x.deckId!)} />
                  ))}
                </ul>
              )}
            <p className="small muted dl-foot">Token estimates and trends are on the <Link href="/dashboard/usage">usage page</Link>.</p>
          </section>
        </>
      )}
    </Frame>
  );
}

function Row({ x, owns, open, onPreview, onDelete }: { x: Generation; owns: boolean; open: boolean; onPreview: () => void; onDelete: () => void }) {
  const s = STATUS[x.status];
  const [report, setReport] = useState<ReportName | null>(null);
  const time = x.finishedAt ? `took ${dur(x.finishedAt - x.startedAt)}` : x.status === "running" ? `${dur(x.updatedAt - x.startedAt)} so far` : "";
  return (
    <li className={`dl-row ${x.status}`}>
      <div className="dl-main">
        <div className="dl-title">
          <strong>{x.title}</strong>
          <span className={`dl-pill ${s.tone}`}>{x.status === "running" && <i className="dl-pulse" aria-hidden />}{s.label}</span>
        </div>
        <p className="dl-meta">
          <span>{x.label}{x.branch ? `, ${x.branch}` : ""}</span>
          <span>{ago(x.startedAt)}</span>
          {time && <span>{time}</span>}
          {x.viewsChecked !== null && <span>{x.viewsWithProblems ? `${x.viewsWithProblems} of ${x.viewsChecked} views need fixes` : `${x.viewsChecked} views checked, all clean`}</span>}
          {x.assistant && <span>{ASSISTANT[x.assistant]}</span>}
          {x.claudeCalls > 0 && <span>≈ {fmtTokens(x.estInputTokens + x.estOutputTokens)} tokens</span>}
        </p>
        {x.status === "running" && <p className="dl-phase">{PHASE[x.phase ?? ""] ?? "Working"}</p>}
        {x.error && x.status !== "completed" && <p className="small bad-text">{x.error}</p>}
      </div>
      <div className="dl-actions">
        {x.chatUrl && x.assistant && x.status !== "failed" && x.phase === "queued" && <a className="btn sm primary" href={x.chatUrl} target="_blank" rel="noreferrer">Open in {ASSISTANT[x.assistant]}</a>}
        {owns && (
          <>
            <button className="btn sm" type="button" aria-expanded={open} onClick={onPreview}>{open ? "Close preview" : "Preview"}</button>
            <a className="btn sm" href={`/api/connector/decks/${x.deckId}?download=1`}>Download</a>
            <details className="dl-more">
              <summary className="btn sm ghost" aria-label="More actions">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </summary>
              <div className="dl-menu" role="menu">
                {(Object.keys(REPORTS) as ReportName[]).map((n) => (
                  <button key={n} role="menuitem" type="button" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); setReport(n); }}>{REPORTS[n]}</button>
                ))}
                {x.chatUrl && <a role="menuitem" href={x.chatUrl} target="_blank" rel="noreferrer">Rebuild in a new chat</a>}
                <button role="menuitem" type="button" className="danger" onClick={onDelete}>Delete demo</button>
              </div>
            </details>
          </>
        )}
      </div>
      {report && <ReportViewer deckId={x.deckId!} name={report} title={x.title} onClose={() => setReport(null)} />}
      {owns && open && <iframe title={`Preview of ${x.title}`} src={`/api/connector/decks/${x.deckId}`} sandbox="allow-scripts" className="dl-preview" />}
    </li>
  );
}

/** A deck's report shown as formatted Markdown in a modal, with the raw file still downloadable. */
function ReportViewer({ deckId, name, title, onClose }: { deckId: string; name: ReportName; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/connector/decks/${deckId}/reports/${name}`;
  useEffect(() => {
    ref.current?.showModal();
    let live = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 404 ? "This demo has no such report yet." : `Couldn't load the report (HTTP ${r.status}).`); return r.text(); })
      .then((t) => { if (live) setText(t); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [url]);
  return (
    <dialog ref={ref} className="rv" aria-labelledby={`rv-${deckId}`} onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
      <header className="rv-head">
        <div>
          <h2 id={`rv-${deckId}`}>{REPORTS[name]}</h2>
          <p className="small muted">{title}</p>
        </div>
        <div className="row">
          <a className="btn sm" href={url} download={name}>Download .md</a>
          <button className="btn sm ghost" type="button" onClick={() => ref.current?.close()} autoFocus>Close</button>
        </div>
      </header>
      <div className="rv-body">
        {error ? <div className="notice bad" role="alert">{error}</div> : text === null ? <Loading /> : <Markdown text={text} />}
      </div>
    </dialog>
  );
}
