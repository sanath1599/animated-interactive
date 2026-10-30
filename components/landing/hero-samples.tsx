"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Sample } from "@/lib/samples";

/**
 * The hero's showpiece: a finished sample deck, live and clickable, on a full-width stage. Tabs switch between
 * the samples; only the open one is loaded. The deck runs sandboxed with the network blocked by its CSP.
 */
// The deck is laid out at desktop size and scaled to fit the stage, so it looks as it does full screen.
const DESKTOP = { w: 1280, h: 720 };

export function HeroSamples({ samples }: { samples: Sample[] }) {
  const [slug, setSlug] = useState(samples[0]?.slug);
  const stage = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [k, setK] = useState(0.8);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setK(el.clientWidth / DESKTOP.w));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = samples.find((x) => x.slug === slug) ?? samples[0];
  if (!s) return null;
  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const n = (i + (e.key === "ArrowRight" ? 1 : samples.length - 1)) % samples.length;
    setSlug(samples[n].slug);
    tabs.current[n]?.focus();
  }
  return (
    <figure className="stage">
      <div className="stage-bar">
        <div className="stage-tabs" role="tablist" aria-label="Sample demos">
          {samples.map((x, i) => (
            <button key={x.slug} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`hs-${x.slug}`} aria-controls="hs-panel"
              aria-selected={x.slug === s.slug} tabIndex={x.slug === s.slug ? 0 : -1} onClick={() => setSlug(x.slug)} onKeyDown={(e) => onKey(e, i)}>
              <span>{x.title}</span><span className="mono">{x.repo}</span>
            </button>
          ))}
        </div>
        <Link className="stage-full small" href={`/samples/${s.slug}`}>Open full screen</Link>
      </div>
      <div className="stage-screen" ref={stage} id="hs-panel" role="tabpanel" aria-labelledby={`hs-${s.slug}`}>
        <iframe key={s.slug} style={{ width: DESKTOP.w, height: DESKTOP.h, transform: `scale(${k})` }} title={`${s.title} demo, built from ${s.repo}`} src={`/samples/${s.slug}/demo`} sandbox="allow-scripts" loading="lazy" />
      </div>
      <figcaption className="small">
        A real output, not a mock-up: {s.title} is one {Math.round(s.bytes / 1024)} KB HTML file, and {s.screenshots} views were checked in Chrome before it was saved. Click into it, or use the arrow keys.
      </figcaption>
    </figure>
  );
}
