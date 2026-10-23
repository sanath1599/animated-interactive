import Link from "next/link";
import "./landing.css";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroDemo } from "@/components/landing/hero-demo";
import { ProductTabs } from "@/components/landing/product-tabs";
import { Spotlight } from "@/components/landing/spotlight";
import { Faq } from "@/components/landing/faq";
import { BrandMark, BRAND_NAME } from "@/components/brand";
import { SAMPLES } from "@/lib/samples";

const STEPS = [
  ["Connect GitHub", "Sign in and install the app on the repositories you choose. Read-only, revocable any time."],
  ["Name the demo", "A title is all that's required. Add an audience, a story, or your own data if you have them."],
  ["Watch it build", "Claude studies the real code, then writes the presentation while you follow each stage live."],
  ["Explore and share", "Preview it in a sandbox, read the verification report, and download a single HTML file."],
];

export default function Landing() {
  return (
    <div className="lp">
      <div className="lp-bg" aria-hidden />
      <LandingNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="pill"><span className="dot-live" />Claude Code · headless Chrome · read-only GitHub</p>
            <h1>Repositories in.<br />Interactive demos <span className="accent">out.</span></h1>
            <p className="lede">Point it at a GitHub repo and it studies the real application, then builds a guided, click-through presentation your leadership can open in any browser. No screenshots pasted into slides.</p>
            <div className="row hero-cta">
              <Link href="/app" className="btn primary lg">Start free</Link>
              <a href="#product" className="btn lg ghost">See the product</a>
            </div>
            <p className="small muted">One self-contained HTML file · No code is ever pushed · Private repos supported</p>
          </div>
          <div className="hero-demo"><HeroDemo /></div>
        </section>

        <section className="built" aria-label="Built with">
          <span className="muted small">Built on</span>
          {["Claude Code", "GitHub Apps", "Headless Chrome", "Docker sandbox", "Next.js"].map((x) => <span key={x} className="built-item"><b>{x}</b></span>)}
        </section>

        <section id="features" className="sec">
          <div className="sec-head">
            <h2>Built for the way demos <span className="accent">actually</span> get made</h2>
            <p className="muted">Every feature answers one frustration: stale screenshots, invented numbers, and decks nobody can click through.</p>
          </div>
          <div className="bento">
            <Spotlight className="b b-wide">
              <h3>It reads the real code</h3>
              <p className="muted">Colors, fonts, routes, charts and components are pulled from the repository, so the demo looks like your product, not a lookalike.</p>
              <div className="code mono" aria-hidden>
                <div><span className="c-k">--primary</span>: <span className="c-s">#4f46e5</span>;</div>
                <div><span className="c-k">font-family</span>: <span className="c-s">Inter</span>;</div>
                <div><span className="c-m">{"// routes found:"}</span> /overview /use-cases /delays</div>
                <div><span className="c-m">{"// themes:"}</span> light, dark</div>
              </div>
            </Spotlight>
            <Spotlight className="b">
              <h3>Progress you can trust</h3>
              <p className="muted">Stages advance only when the work really starts. No fake percentages.</p>
              <div className="mini-steps" aria-hidden><i className="d" /><i className="d" /><i className="d" /><i className="a" /><i /><i /><i /><i /></div>
            </Spotlight>
            <Spotlight className="b">
              <h3>Your numbers stay exact</h3>
              <p className="muted">Upload a table and every value, label and date range is kept as written.</p>
              <div className="code mono" aria-hidden><div>Region,Revenue</div><div>EMEA,<span className="c-s">1,204,300.50</span></div><div>APAC,<span className="c-s">  988,120.00</span></div></div>
            </Spotlight>
            <Spotlight className="b">
              <h3>Sandboxed by default</h3>
              <p className="muted">Each run gets its own locked-down container and a throwaway copy of the code.</p>
              <div className="pills" aria-hidden><span className="chip">read-only filesystem</span><span className="chip">no capabilities</span><span className="chip">no GitHub token</span><span className="chip">time limited</span></div>
            </Spotlight>
            <Spotlight className="b">
              <h3>Verified in a real browser, honestly</h3>
              <p className="muted">Slides, tour steps, dark mode and a narrow phone view are captured and checked. Anything that couldn&apos;t run is reported as not run, never as passed.</p>
              <ul className="checks" aria-hidden>
                <li><span className="chip ok">passed</span>Every slide at 1280×720</li>
                <li><span className="chip ok">passed</span>No console errors</li>
                <li><span className="chip ok">passed</span>Deep links and keyboard navigation</li>
                <li><span className="chip warn">not run</span>Fullscreen toggle (needs a real window)</li>
              </ul>
            </Spotlight>
          </div>
        </section>

        <section id="product" className="sec">
          <div className="sec-head center">
            <h2>One repository. Four <span className="accent">screens.</span></h2>
            <p className="muted">Tap through the real flow. Use the arrow keys to move between tabs.</p>
          </div>
          <ProductTabs />
        </section>

        <section id="samples" className="sec">
          <div className="sec-head">
            <h2>See what a run <span className="accent">produces</span></h2>
            <p className="muted">Three real repositories, three finished demos. Open one and click around.</p>
          </div>
          <div className="lp-samples">
            {SAMPLES.map((s) => (
              <Link key={s.slug} href={`/samples/${s.slug}`} className="lp-sample">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/samples/${s.slug}.png`} alt={`Preview of the ${s.title} demo`} loading="lazy" />
                <div><h3>{s.title}</h3><p className="muted small">{s.tagline}</p></div>
              </Link>
            ))}
          </div>
        </section>

        <section id="how" className="sec">
          <div className="sec-head"><h2>How it works</h2></div>
          <ol className="steps-list">
            {STEPS.map(([t, d], i) => (
              <li key={t}><span className="step-n mono">{i + 1}</span><div><h3>{t}</h3><p className="muted">{d}</p></div></li>
            ))}
          </ol>
        </section>

        <section id="trust" className="sec trust">
          <div className="sec-head">
            <h2>Made for code you can&apos;t afford to leak</h2>
            <p className="muted">Repository content is treated as untrusted input, and the agent only ever sees a scrubbed copy.</p>
          </div>
          <div className="trust-grid">
            {[
              ["Read-only access", "Contents and Metadata read permissions. No write scopes, ever."],
              ["Scrubbed before reading", "Secret files and escaping symlinks are removed from the copy first."],
              ["Shell commands need your OK", "Anything outside a short safe list pauses the run and asks you."],
              ["Previews can't phone home", "Generated HTML is served with a strict policy and shown in a sandboxed frame."],
            ].map(([t, d]) => <div key={t} className="trust-item"><h4>{t}</h4><p className="muted small">{d}</p></div>)}
          </div>
        </section>

        <section id="faq" className="sec">
          <div className="sec-head"><h2>Questions, answered</h2></div>
          <Faq />
        </section>

        <section className="cta">
          <h2>Your next review deserves a demo people can <span className="accent">click.</span></h2>
          <p className="muted">Connect GitHub and have a first draft in minutes.</p>
          <Link href="/app" className="btn primary lg">Start free</Link>
        </section>
      </main>
      <footer className="lf">
        <div className="lf-in">
          <div><Link href="/" className="brand"><BrandMark />{BRAND_NAME}</Link><p className="small muted">Interactive executive demos, generated from your real code.</p></div>
          <nav className="row small" aria-label="Footer"><a href="#features">Features</a><a href="#how">How it works</a><a href="#trust">Safety</a><a href="#faq">FAQ</a><Link href="/app">Open the app</Link></nav>
        </div>
        <p className="small muted lf-copy">© 2026 {BRAND_NAME}. Sample data on this page is illustrative.</p>
      </footer>
    </div>
  );
}
