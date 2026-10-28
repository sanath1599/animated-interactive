"use client";
import { useEffect, useRef, useState } from "react";

// Illustrative sample build, scripted to mirror the real phases a chat build reports to the dashboard.
const STAGES = [
  "Request set up on the dashboard",
  "Claude picks it up in claude.ai",
  "Reading the code",
  "Planning the slides",
  "Copying the product's styles",
  "Rebuilding the screens",
  "Checking every slide in a browser",
  "Writing the reports",
];
const SCRIPT: { stage: number; text: string }[] = [
  { stage: 0, text: "northwind/analytics-portal, main" },
  { stage: 0, text: "Fetching 214 files; 3 secret-like files removed" },
  { stage: 1, text: "start_demo: Northwind quarterly review" },
  { stage: 2, text: "read_files: AppShell.tsx, Sidebar.tsx, KpiTiles.tsx" },
  { stage: 2, text: "read_files: tailwind.config.ts, globals.css" },
  { stage: 3, text: "save_demo_plan: 7 slides, standard detail" },
  { stage: 4, text: "save_demo_styles: indigo #4f46e5, Inter, 8px radius" },
  { stage: 5, text: "save_demo_screen: Overview, 4 steps rendered" },
  { stage: 5, text: "save_demo_screen: Revenue, 3 steps rendered" },
  { stage: 6, text: "finish_demo: 24 views checked, all clean" },
  { stage: 7, text: "Verification and evidence reports saved" },
  { stage: 7, text: "Ready on your dashboard" },
];

export function HeroDemo() {
  const [step, setStep] = useState(0);
  const [reduced, setReduced] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setReduced(m.matches); if (m.matches) setStep(SCRIPT.length); };
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setStep((s) => (s >= SCRIPT.length + 3 ? 0 : s + 1)), 1150);
    return () => clearInterval(t);
  }, [reduced]);

  useEffect(() => { logRef.current?.scrollTo({ top: 9999, behavior: "smooth" }); }, [step]);

  const shown = SCRIPT.slice(0, Math.min(step, SCRIPT.length));
  const stage = step === 0 ? -1 : shown[shown.length - 1].stage;
  const done = step >= SCRIPT.length;
  const progress = Math.min(1, step / SCRIPT.length);

  return (
    <div className="hd" role="img" aria-label="Animated example of a demo being built: Claude works in claude.ai while the dashboard shows each stage.">
      <div className="win-bar">
        <i /><i /><i />
        <span className="win-url mono">app.antm.ai/dashboard · sample build</span>
        <span className={`chip ${done ? "ok" : "warn"}`}>{done ? "ready" : <><span className="dot-live" />building</>}</span>
      </div>
      <div className="hd-body">
        <div className="hd-col">
          <p className="hd-title">Northwind quarterly review</p>
          <ol className="timeline">
            {STAGES.map((s, i) => (
              <li key={s} className={done || i < stage ? "done" : i === stage ? "active" : ""}>
                <span className="dot" /><span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="hd-col">
          <div className="log hd-log" ref={logRef} aria-hidden>
            {shown.map((l, i) => <div key={i}>{l.text}</div>)}
            {!done && <div className="caret">▍</div>}
          </div>
          <div className="hd-slide" aria-hidden>
            <div className="hd-slide-bar" style={{ width: `${progress * 100}%` }} />
            <div className={`hd-slide-body ${stage >= 5 ? "on" : ""}`}>
              <div className="hs-side" />
              <div className="hs-main">
                <div className="hs-kpis"><b /><b /><b /></div>
                <svg viewBox="0 0 200 60" className="hs-chart"><path d="M0 48 L25 40 L50 44 L75 28 L100 32 L125 18 L150 22 L175 8 L200 12 L200 60 L0 60Z" fill="hsl(var(--ember) / .16)" /><path d="M0 48 L25 40 L50 44 L75 28 L100 32 L125 18 L150 22 L175 8 L200 12" fill="none" stroke="hsl(var(--ember))" strokeWidth="2" /></svg>
              </div>
            </div>
            <span className="hd-cap mono">{stage >= 5 ? "slide preview · illustrative" : "waiting for the first screen…"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
