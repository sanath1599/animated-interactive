"use client";
import { useRef, useState } from "react";

const TABS = ["Code", "Presentation", "Chat", "Result"] as const;
type Tab = (typeof TABS)[number];
const URLS: Record<Tab, string> = { Code: "app.antm.ai/dashboard", Presentation: "app.antm.ai/dashboard", Chat: "claude.ai or chatgpt.com", Result: "app.antm.ai/dashboard" };

const REPOS = [
  { n: "analytics-portal", o: "northwind", v: "Private" },
  { n: "field-ops-app", o: "northwind", v: "Private" },
  { n: "design-tokens", o: "northwind", v: "" },
];

function Panel({ tab }: { tab: Tab }) {
  if (tab === "Code")
    return (
      <div className="pp">
        <p className="pp-q">Source code</p>
        <div className="row"><span className="chip warn">GitHub</span><span className="chip">Azure DevOps, GitLab, Bitbucket</span><span className="chip">Zip file</span></div>
        <div className="pp-search">Search 42 repositories</div>
        <div className="pp-list">
          {REPOS.map((r, i) => (
            <div key={r.n} className={`pp-row ${i === 0 ? "sel" : ""}`}><span><span className="muted">{r.o}/</span>{r.n}</span>{r.v && <span className="chip">{r.v}</span>}</div>
          ))}
        </div>
        <p className="small muted">Only repositories you let the GitHub App read appear here. Access is read-only.</p>
      </div>
    );
  if (tab === "Presentation")
    return (
      <div className="pp pp-split">
        <div className="pp pp-form">
          <label>Title</label>
          <div className="pp-input serif">Northwind quarterly review<span className="caret">▍</span></div>
          <label>Coverage</label>
          <div className="pp-choices">
            <div><strong>Brief</strong><span className="small muted">4–6 slides</span></div>
            <div className="sel"><strong>Standard</strong><span className="small muted">One slide per area</span></div>
            <div><strong>Detailed</strong><span className="small muted">Every page and state</span></div>
          </div>
        </div>
        <div className="pp-cover"><span className="small muted">northwind/analytics-portal, main</span><b>Northwind quarterly review</b><span className="small muted">Presented by Dana Reyes · Northwind · 12 November 2026</span><i>Start</i></div>
      </div>
    );
  if (tab === "Chat")
    return (
      <div className="pp">
        <div className="pp-msg">Build my interactive demo “Northwind quarterly review” with the Animated Technical Interactive connector: call start_demo with requestId gen_7f3a… and follow the guide it returns.</div>
        <div className="pp-tools">
          {[["start_demo", "Request found: standard detail, 1 presenter"], ["read_files", "AppShell.tsx, Sidebar.tsx, tailwind.config.ts and 31 more"], ["save_demo_plan", "7 slides"], ["save_demo_screen", "Overview: 4 steps rendered, no problems"], ["finish_demo", "24 views checked, all clean"]].map(([t, d]) => (
            <div key={t} className="pp-tool"><span className="chip ok">{t}</span><span className="small muted">{d}</span></div>
          ))}
        </div>
        <p className="small muted">Runs in Claude or ChatGPT on your own plan. Let the connector&apos;s tools run without asking and builds go straight through.</p>
      </div>
    );
  return (
    <div className="pp">
      <div className="pp-thumbs">
        {["Welcome", "Overview", "Revenue", "Regions", "Your turn", "Close"].map((s, i) => (
          <div key={s} className="pp-thumb"><div className="pp-thumb-art" style={{ ["--k" as string]: i }} /><span className="mono small">{i + 1}. {s}</span></div>
        ))}
      </div>
      <div className="row"><span className="btn primary sm">Preview</span><span className="btn sm">Download</span><span className="btn sm ghost">Verification report</span><span className="chip ok">24 views checked</span><span className="chip ok">no external requests</span></div>
    </div>
  );
}

export function ProductTabs() {
  const [tab, setTab] = useState<Tab>("Code");
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
          <button key={t} ref={(el) => { refs.current[i] = el; }} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls="pt-panel" tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)} onKeyDown={(e) => onKey(e, i)} className={tab === t ? "on" : ""}>{i + 1}. {t}</button>
        ))}
      </div>
      <div className="win">
        <div className="win-bar"><i /><i /><i /><span className="win-url mono">{URLS[tab]}</span></div>
        <div id="pt-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-panel" key={tab}><Panel tab={tab} /></div>
      </div>
    </div>
  );
}
