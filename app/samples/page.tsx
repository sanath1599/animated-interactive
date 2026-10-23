import Link from "next/link";
import "../landing.css";
import "./samples.css";
import { LandingNav } from "@/components/landing/landing-nav";
import { SAMPLES } from "@/lib/samples";

export const metadata = { title: "Samples · Animated Technical Interactive", description: "Real demos generated from real repositories." };

export default function SamplesPage() {
  return (
    <div className="lp">
      <div className="lp-bg" aria-hidden />
      <LandingNav />
      <main>
        <section className="sec sm-head">
          <h1 className="sm-h">Real demos, generated from <span className="accent">real repositories</span></h1>
          <p className="muted lede">Each one below was produced by a single run: Claude read the code, built the presentation, and checked it in headless Chrome. Open one and click around.</p>
        </section>
        <div className="sm-grid">
          {SAMPLES.map((s) => (
            <Link key={s.slug} href={`/samples/${s.slug}`} className="sm-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/samples/${s.slug}.png`} alt={`Preview of the ${s.title} demo`} loading="lazy" />
              <div className="sm-card-body">
                <h3>{s.title}</h3>
                <p className="muted small">{s.tagline}</p>
                <span className="chip">{s.repo}</span>
              </div>
            </Link>
          ))}
        </div>
        {SAMPLES.length === 0 && <p className="muted">Samples are on their way.</p>}
      </main>
    </div>
  );
}
