import Link from "next/link";
import { notFound } from "next/navigation";
import "../../landing.css";
import "../samples.css";
import { LandingNav } from "@/components/landing/landing-nav";
import { SAMPLES, getSample } from "@/lib/samples";

export function generateStaticParams() { return SAMPLES.map((s) => ({ slug: s.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const s = getSample((await params).slug);
  return { title: s ? `${s.title} · Samples` : "Sample" };
}

export default async function SamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = getSample((await params).slug);
  if (!s) notFound();
  const idx = SAMPLES.findIndex((x) => x.slug === s.slug);
  const next = SAMPLES[(idx + 1) % SAMPLES.length];
  return (
    <div className="lp">
      <div className="lp-bg" aria-hidden />
      <LandingNav />
      <main className="sv">
        <div className="sv-top">
          <div>
            <Link href="/samples" className="muted small">All samples</Link>
            <h1 className="sm-h sv-h">{s.title}</h1>
            <p className="muted">{s.tagline}</p>
          </div>
          <div className="row">
            <a className="btn" href={`/samples/${s.slug}/demo?download=1`}>Download HTML</a>
            <Link className="btn primary" href="/app">Make your own</Link>
          </div>
        </div>
        <div className="win sv-win">
          <div className="win-bar"><i /><i /><i /><span className="win-url mono">{s.slug}.html · {(s.bytes / 1024).toFixed(0)} KB · self-contained</span></div>
          <iframe title={`${s.title} interactive demo`} src={`/samples/${s.slug}/demo`} sandbox="allow-scripts" allowFullScreen referrerPolicy="no-referrer" className="sv-frame" />
        </div>
        <div className="sv-meta">
          <div><h3>What you&apos;re seeing</h3><ul className="sv-list">{s.highlights.map((h) => <li key={h}>{h}</li>)}</ul></div>
          <div><h3>About this sample</h3><p className="muted small">Generated from the {s.repo} repository in one run, then rendered in headless Chrome ({s.screenshots} screenshots captured). Figures that couldn&apos;t be verified from the code are labelled illustrative inside the demo. Click through it, or press F for fullscreen.</p>
            <p className="small" style={{ marginTop: ".8rem" }}><Link href={`/samples/${next.slug}`}>Next sample: {next.title}</Link></p></div>
        </div>
      </main>
    </div>
  );
}
