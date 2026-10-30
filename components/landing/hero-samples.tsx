"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Sample } from "@/lib/samples";

/**
 * The hero's showpiece: a finished sample deck, live and clickable, in a browser frame. Tabs switch between
 * the samples; only the open one is loaded. The deck runs sandboxed with the network blocked by its CSP.
 */
// The deck is laid out at desktop size and scaled to fit the frame, so it looks as it does full screen.
const DESKTOP = { w: 1280, h: 752 };

export function HeroSamples({ samples }: { samples: Sample[] }) {
  const [slug, setSlug] = useState(samples[0]?.slug);
  const stage = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.5);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setK(el.clientWidth / DESKTOP.w));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = samples.find((x) => x.slug === slug) ?? samples[0];
  if (!s) return null;
  return (
    <figure className="hs">
      <div className="win">
        <div className="win-bar">
          <i /><i /><i />
          <span className="win-url mono">{s.slug}.html · built from github.com/{s.repo}</span>
          <Link className="hs-full" href={`/samples/${s.slug}`}>Open full screen</Link>
        </div>
        <div className="hs-stage" ref={stage}>
          <iframe key={s.slug} style={{ width: DESKTOP.w, height: DESKTOP.h, transform: `scale(${k})` }} title={`${s.title} demo, built from its repository`} src={`/samples/${s.slug}/demo`} sandbox="allow-scripts" loading="lazy" />
        </div>
      </div>
      <figcaption className="hs-cap">
        <div className="hs-tabs" role="tablist" aria-label="Sample demos">
          {samples.map((x) => (
            <button key={x.slug} type="button" role="tab" aria-selected={x.slug === s.slug} className={x.slug === s.slug ? "on" : ""} onClick={() => setSlug(x.slug)}>{x.title}</button>
          ))}
        </div>
        <p className="small muted">A real output, not a mock-up: click into it and use the arrow keys. {s.screenshots} views were checked in a browser before it was saved.</p>
      </figcaption>
    </figure>
  );
}
