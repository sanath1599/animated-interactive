"use client";
import { useEffect, useState } from "react";
import { api, fmtBytes } from "@/lib/client";
import { VerificationSummary, type Checks } from "./verification-summary";
import type { ArtifactInfo } from "@/types/artifacts";
import type { RunRecord } from "@/types/run";

interface Props { run: RunRecord; onNew: () => void }

export function ArtifactPreview({ run, onNew }: Props) {
  const [arts, setArts] = useState<ArtifactInfo[]>([]);
  const [checks, setChecks] = useState<Checks | null>(null);
  const [report, setReport] = useState<{ verification?: string; evidence?: string }>({});
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    api<{ artifacts: ArtifactInfo[]; checks: Checks | null }>(`/api/runs/${run.id}/artifacts`).then(async (d) => {
      setArts(d.artifacts); setChecks(d.checks);
      const text = async (name: string) => { const a = d.artifacts.find((x) => x.name === name); return a ? fetch(`/api/runs/${run.id}/artifacts/${a.id}`).then((r) => r.text()) : undefined; };
      setReport({ verification: await text("verification-report.md"), evidence: await text("evidence-report.md") });
    }, () => {});
  }, [run.id]);

  const html = arts.find((a) => a.kind === "html");
  const shots = arts.filter((a) => a.kind === "screenshot");
  const base = (a: ArtifactInfo) => `/api/runs/${run.id}/artifacts/${a.id}`;
  const ok = run.status === "succeeded";

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <p className="eyebrow">{ok ? "Ready to explore" : "Run did not complete"}</p>
          <h2>{ok ? <>Your demo is <em>ready</em></> : <>Run <em>{run.status}</em></>}</h2>
        </div>
        <button className="btn" onClick={onNew}>New demo</button>
      </div>
      {!ok && run.error && <div className="notice bad" role="alert">{run.error}</div>}
      {html ? (
        <div className="card stack">
          <div className="row spread">
            <div><strong className="mono">{html.name}</strong> <span className="muted small">· {fmtBytes(html.size)}</span>{!ok && <span className="chip warn" style={{ marginLeft: ".5rem" }}>partial result</span>}</div>
            <div className="row">
              <button className="btn primary" onClick={() => setPreview((p) => !p)}>{preview ? "Hide preview" : "Preview"}</button>
              <a className="btn" href={`${base(html)}?download=1`}>Download HTML</a>
            </div>
          </div>
          {preview && <iframe className="preview" title="Generated presentation" src={base(html)} sandbox="allow-scripts allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" />}
        </div>
      ) : ok ? <div className="notice warn">The run finished but no HTML file was found.</div> : null}

      <div className="cols" style={{ gridTemplateColumns: undefined }}>
        <div className="card"><p className="eyebrow">Verification</p><VerificationSummary checks={checks} /></div>
      </div>
      {shots.length > 0 && (
        <div className="card"><p className="eyebrow">Screenshots ({shots.length})</p>
          <div className="row">{shots.slice(0, 24).map((s) => <a key={s.id} href={base(s)} target="_blank" rel="noreferrer" className="chip">{s.name}</a>)}</div>
        </div>
      )}
      {(report.verification || report.evidence) && (
        <div className="card stack">
          {report.verification && <details><summary>Verification report</summary><pre className="log" style={{ whiteSpace: "pre-wrap" }}>{report.verification}</pre></details>}
          {report.evidence && <details><summary>Data sources &amp; caveats</summary><pre className="log" style={{ whiteSpace: "pre-wrap" }}>{report.evidence}</pre></details>}
        </div>
      )}
    </div>
  );
}
