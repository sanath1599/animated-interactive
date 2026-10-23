"use client";
import { useRef, useState } from "react";

const TABS = ["Repository", "Configure", "Generate", "Result"] as const;
type Tab = (typeof TABS)[number];

const REPOS = [
  { n: "analytics-portal", o: "northwind", v: "private", d: "Quarterly reporting dashboards" },
  { n: "field-ops-app", o: "northwind", v: "private", d: "Technician scheduling" },
  { n: "design-tokens", o: "northwind", v: "public", d: "Shared brand tokens" },
];

function Panel({ tab }: { tab: Tab }) {
  if (tab === "Repository")
    return (
      <div className="pp">
        <div className="pp-search mono">Search repositories <kbd>⌘K</kbd></div>
        <div className="pp-grid">
          {REPOS.map((r, i) => (
            <div key={r.n} className={`pp-repo ${i === 0 ? "sel" : ""}`}>
              <div className="row spread"><strong>{r.n}</strong><span className={`chip ${r.v === "private" ? "warn" : ""}`}>{r.v}</span></div>
              <div className="mono small muted">{r.o}</div>
              <p className="small muted">{r.d}</p>
            </div>
          ))}
        </div>
        <p className="small muted">Only repositories you installed the GitHub App on appear here. Access is read-only.</p>
      </div>
    );
  if (tab === "Configure")
    return (
      <div className="pp pp-form">
        <label>Presentation title</label>
        <div className="pp-input">Northwind quarterly review<span className="caret">▍</span></div>
        <label>Additional details <span className="muted">(optional)</span></label>
        <div className="pp-input tall muted">Audience: regional directors. Lead with delivery speed…</div>
        <div className="row"><span className="chip">sales-q3.csv</span><span className="chip">brand-screenshot.png</span><span className="chip ok">values kept exactly</span></div>
      </div>
    );
  if (tab === "Generate")
    return (
      <div className="pp">
        <div className="row spread"><strong>Northwind quarterly review</strong><span className="chip warn"><span className="dot-live" />04:12</span></div>
        <ol className="timeline">
          {["Fetching source code", "Inspecting the application", "Generating the HTML presentation", "Running browser verification"].map((s, i) => (
            <li key={s} className={i < 2 ? "done" : i === 2 ? "active" : ""}><span className="dot" />{s}</li>
          ))}
        </ol>
        <div className="log"><div>Reading KpiTiles.tsx</div><div>Writing northwind-quarterly-review.html</div><div className="warn">Permission needed: run a headless browser command</div></div>
      </div>
    );
  return (
    <div className="pp">
      <div className="pp-thumbs">
        {["Welcome", "Overview", "Revenue", "Regions", "Your turn", "Close"].map((s, i) => (
          <div key={s} className="pp-thumb"><div className="pp-thumb-art" style={{ ["--k" as string]: i }} /><span className="mono small">{i + 1}. {s}</span></div>
        ))}
      </div>
      <div className="row"><span className="btn primary sm">Preview</span><span className="btn sm">Download HTML</span><span className="chip ok">17 screenshots</span><span className="chip ok">no external requests</span><span className="chip warn">fullscreen: not run</span></div>
    </div>
  );
}

export function ProductTabs() {
  const [tab, setTab] = useState<Tab>("Repository");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const n = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[n]); refs.current[n]?.focus();
  }
  return (
    <div className="pt">
      <div className="pt-tabs" role="tablist" aria-label="Product tour">
        {TABS.map((t, i) => (
          <button key={t} ref={(el) => { refs.current[i] = el; }} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls="pt-panel" tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)} onKeyDown={(e) => onKey(e, i)} className={tab === t ? "on" : ""}>{t}</button>
        ))}
      </div>
      <div className="win">
        <div className="win-bar"><i /><i /><i /><span className="win-url mono">ati.antm.ai/app/{tab.toLowerCase()}</span></div>
        <div id="pt-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-panel" key={tab}><Panel tab={tab} /></div>
      </div>
    </div>
  );
}
