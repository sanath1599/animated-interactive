import Link from "next/link";
import "../landing.css";
import { LandingNav } from "@/components/landing/landing-nav";
import { SAMPLES } from "@/lib/samples";

export const metadata = { title: "Samples · antm", description: "Real demos generated from real repositories." };

export default function SamplesPage() {
  return (
    <div className="lp">
      <LandingNav />
      <main>
        <section className="sec sm-head">
          <h1 className="sm-h">Samples built from real repositories</h1>
          <p className="lede">Each one came out of a single build: the assistant read the code, rebuilt the screens, and antm checked every slide in Chrome. Open one and click around.</p>
        </section>
        <ul className="sample-rows">
          {SAMPLES.map((s) => (
            <li key={s.slug}>
              <Link href={`/samples/${s.slug}`} className="sample-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/samples/${s.slug}.png`} alt="" loading="lazy" />
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.tagline}</p>
                  <p className="small sample-meta"><span className="mono">{s.repo}</span> <span>{Math.round(s.bytes / 1024)} KB</span> <span>{s.screenshots} views checked</span></p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {SAMPLES.length === 0 && <p className="muted">Samples are on their way.</p>}
      </main>
    </div>
  );
}
