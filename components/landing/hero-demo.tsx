"use client";
import { useEffect, useRef, useState } from "react";
import { STAGES, STAGE_LABELS } from "@/types/run";

// Illustrative sample run, scripted to mirror the real stage names and log style.
const SCRIPT: { stage: number; text: string; kind?: "warn" }[] = [
  { stage: 0, text: "Connecting to northwind/analytics-portal" },
  { stage: 1, text: "Fetching branch main · 214 files" },
  { stage: 1, text: "3 secret-like files excluded from analysis" },
  { stage: 2, text: "Reading tailwind.config.ts" },
  { stage: 2, text: "Reading Sidebar.tsx, KpiTiles.tsx" },
  { stage: 3, text: "Brand: indigo #4f46e5 · Inter · light theme" },
  { stage: 4, text: "Writing northwind-quarterly-review.html" },
  { stage: 4, text: "Slide 3 of 6 · revenue chart (inline SVG)" },
  { stage: 5, text: "Headless Chrome · 1280×720 · slide 1" },
  { stage: 5, text: "17 screenshots captured · 0 console errors" },
  { stage: 6, text: "Presentation saved (61 KB, self-contained)" },
  { stage: 7, text: "Ready to explore" },
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
    <div className="hd" role="img" aria-label="Animated example of a demo being generated: eight stages tick through while activity streams in.">
      <div className="win-bar">
        <i /><i /><i />
        <span className="win-url mono">ati.antm.ai/app · sample run</span>
        <span className={`chip ${done ? "ok" : "warn"}`}>{done ? "ready" : <><span className="dot-live" />running</>}</span>
      </div>
      <div className="hd-body">
        <div className="hd-col">
          <p className="hd-title">Northwind quarterly review</p>
          <ol className="timeline">
            {STAGES.map((s, i) => (
              <li key={s} className={done || i < stage ? "done" : i === stage ? "active" : ""}>
                <span className="dot" /><span>{STAGE_LABELS[s]}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="hd-col">
          <div className="log hd-log" ref={logRef} aria-hidden>
            {shown.map((l, i) => <div key={i} className={l.kind}>{l.text}</div>)}
            {!done && <div className="caret">▍</div>}
          </div>
          <div className="hd-slide" aria-hidden>
            <div className="hd-slide-bar" style={{ width: `${progress * 100}%` }} />
            <div className={`hd-slide-body ${stage >= 4 ? "on" : ""}`}>
              <div className="hs-side" />
              <div className="hs-main">
                <div className="hs-kpis"><b /><b /><b /></div>
                <svg viewBox="0 0 200 60" className="hs-chart"><path d="M0 48 L25 40 L50 44 L75 28 L100 32 L125 18 L150 22 L175 8 L200 12 L200 60 L0 60Z" fill="hsl(var(--ember) / .16)" /><path d="M0 48 L25 40 L50 44 L75 28 L100 32 L125 18 L150 22 L175 8 L200 12" fill="none" stroke="hsl(var(--ember))" strokeWidth="2" /></svg>
              </div>
            </div>
            <span className="hd-cap mono">{stage >= 4 ? "slide preview · illustrative" : "waiting for the first slide…"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
