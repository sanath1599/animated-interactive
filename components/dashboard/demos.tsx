"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Frame, Loading, SignedOutGate } from "./frame";
import { NewDemo } from "./new-demo";
import { fmtTokens } from "./usage-chart";
import { ago, dur, useDashboard, type Generation, type Status } from "./use-dashboard";

const STATUS: Record<Status, { label: string; tone: string }> = {
  completed: { label: "Ready", tone: "ok" }, running: { label: "Building", tone: "run" }, failed: { label: "Failed", tone: "bad" },
  stopped: { label: "Stopped", tone: "" }, interrupted: { label: "Interrupted", tone: "bad" },
};
const PHASE: Record<string, string> = {
  queued: "Waiting for you to press send in claude.ai", read: "Reading the code", plan: "Planning the slides", foundation: "Copying the product's styles",
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
          <NewDemo credentials={data.credentials} onCreated={load} />
          <section className="dl" aria-labelledby="dl-h">
            <h2 id="dl-h" className="dx-h2">Your demos</h2>
            {data.generations.length === 0
              ? <p className="muted">Nothing yet. The demos you start above appear here, with their progress while Claude works.</p>
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
          {x.claudeCalls > 0 && <span>≈ {fmtTokens(x.estInputTokens + x.estOutputTokens)} tokens</span>}
        </p>
        {x.status === "running" && <p className="dl-phase">{PHASE[x.phase ?? ""] ?? "Working"}</p>}
        {x.error && x.status !== "completed" && <p className="small bad-text">{x.error}</p>}
      </div>
      <div className="dl-actions">
        {x.claudeUrl && x.status !== "failed" && x.phase === "queued" && <a className="btn sm primary" href={x.claudeUrl} target="_blank" rel="noreferrer">Open in Claude</a>}
        {owns && (
          <>
            <button className="btn sm" type="button" aria-expanded={open} onClick={onPreview}>{open ? "Close preview" : "Preview"}</button>
            <a className="btn sm" href={`/api/connector/decks/${x.deckId}?download=1`}>Download</a>
            <details className="dl-more">
              <summary className="btn sm ghost" aria-label="More actions">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </summary>
              <div className="dl-menu" role="menu">
                <a role="menuitem" href={`/api/connector/decks/${x.deckId}/reports/verification-report.md`}>Verification report</a>
                <a role="menuitem" href={`/api/connector/decks/${x.deckId}/reports/evidence-report.md`}>Evidence report</a>
                {x.claudeUrl && <a role="menuitem" href={x.claudeUrl} target="_blank" rel="noreferrer">Rebuild in a new chat</a>}
                <button role="menuitem" type="button" className="danger" onClick={onDelete}>Delete demo</button>
              </div>
            </details>
          </>
        )}
      </div>
      {owns && open && <iframe title={`Preview of ${x.title}`} src={`/api/connector/decks/${x.deckId}`} sandbox="allow-scripts" className="dl-preview" />}
    </li>
  );
}
