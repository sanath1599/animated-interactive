import Link from "next/link";
import "./landing.css";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroDemo } from "@/components/landing/hero-demo";
import { HeroSamples } from "@/components/landing/hero-samples";
import { ChatGPTIcon, ClaudeIcon } from "@/components/assistant-icons";
import { ProductTabs } from "@/components/landing/product-tabs";
import { Spotlight } from "@/components/landing/spotlight";
import { Faq } from "@/components/landing/faq";
import { BrandMark, BRAND_NAME } from "@/components/brand";
import { SAMPLES } from "@/lib/samples";
import { AUTHOR, GITHUB_URL, GitHubIcon, LINKEDIN_URL, LinkedInIcon } from "@/components/social";

const STEPS = [
  ["Sign in with GitHub", "Choose the repositories the app may read. Read-only and revocable any time. Azure DevOps, GitLab, Bitbucket and zip files work too."],
  ["Connect Claude or ChatGPT", "Add the connector in claude.ai with one click, or as a plugin in ChatGPT. Let its tools run without asking so builds don't stop."],
  ["Describe the demo", "Pick the code, give it a title and choose how detailed it should be. A Claude or ChatGPT chat opens with the request already in it."],
  ["The assistant builds, we check", "Your assistant reads the code and rebuilds each screen on your own plan. This site assembles the deck, checks every slide in a browser, and keeps it on your dashboard."],
];

export default function Landing() {
  return (
    <div className="lp">
      <div className="lp-bg" aria-hidden />
      <LandingNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="ai-badges" aria-label="Works with">
              <span className="ai-badge"><ClaudeIcon />for Claude</span>
              <span className="ai-badge"><ChatGPTIcon />for ChatGPT</span>
            </div>
            <h1>Your code, as a demo people can <span className="accent">click.</span></h1>
            <p className="lede">Pick a repository and describe the demo. Claude or ChatGPT, in your own account, rebuilds the real screens from the code; antm checks every slide in a browser and hands you one HTML file anyone can open.</p>
            <div className="row hero-cta">
              <Link href="/dashboard" className="btn primary lg">Build a demo</Link>
              <a href="#build" className="btn lg ghost">Watch one being built</a>
            </div>
            <ul className="hero-facts small muted">
              <li>Private repositories, read-only</li>
              <li>Nothing pushed to your code</li>
              <li>GitHub, Azure DevOps, GitLab, Bitbucket or a zip</li>
            </ul>
          </div>
          <div className="hero-demo"><HeroSamples samples={SAMPLES} /></div>
        </section>

        <section id="build" className="sec watch">
          <div className="watch-copy">
            <h2>Watch a build</h2>
            <p className="muted">You fill in one short form. Your assistant takes it from there, calling antm&apos;s tools to read the code, rebuild each screen and check it, while the dashboard shows where it is.</p>
            <div className="watch-ai">
              <div><ClaudeIcon /><p><strong>In Claude</strong><br /><span className="muted small">A chat opens with the request typed in. Allow the tools once and it runs to the end.</span></p></div>
              <div><ChatGPTIcon /><p><strong>In ChatGPT</strong><br /><span className="muted small">Add antm as a plugin in Developer mode, then approve each save as it comes up.</span></p></div>
            </div>
          </div>
          <HeroDemo />
        </section>

        <section id="features" className="sec">
          <div className="sec-head">
            <h2>Built for the way demos <span className="accent">actually</span> get made</h2>
            <p className="muted">Every feature answers one frustration: stale screenshots, invented numbers, and decks nobody can click through.</p>
          </div>
          <div className="bento">
            <Spotlight className="b b-wide">
              <h3>It reads the real code</h3>
              <p className="muted">Each screen is rebuilt from its own components: the same structure, class names, colours, fonts, spacing, copy and icons, resolved from the source. A 1:1 copy, not a lookalike.</p>
              <div className="code mono" aria-hidden>
                <div><span className="c-k">--primary</span>: <span className="c-s">#4f46e5</span>;</div>
                <div><span className="c-k">font-family</span>: <span className="c-s">Inter</span>;</div>
                <div><span className="c-m">{"// routes found:"}</span> /overview /use-cases /delays</div>
                <div><span className="c-m">{"// themes:"}</span> light, dark</div>
              </div>
            </Spotlight>
            <Spotlight className="b">
              <h3>Follow every build</h3>
              <p className="muted">Your dashboard shows each stage as your assistant reaches it, then keeps the finished demo and its reports.</p>
              <div className="mini-steps" aria-hidden><i className="d" /><i className="d" /><i className="d" /><i className="a" /><i /><i /><i /><i /></div>
            </Spotlight>
            <Spotlight className="b">
              <h3>Your assistant, your plan</h3>
              <p className="muted">Claude or ChatGPT runs in your own account. This site never calls an AI model and never sees your chat.</p>
              <div className="code mono" aria-hidden><div>start_demo <span className="c-m">{"// your request"}</span></div><div>save_demo_screen <span className="c-s">ok</span></div><div>finish_demo <span className="c-s">24 views</span></div></div>
            </Spotlight>
            <Spotlight className="b">
              <h3>Sandboxed checks</h3>
              <p className="muted">Every slide is rendered in a locked-down container with the network switched off.</p>
              <div className="pills" aria-hidden><span className="chip">read-only filesystem</span><span className="chip">no network</span><span className="chip">no capabilities</span><span className="chip">time limited</span></div>
            </Spotlight>
            <Spotlight className="b">
              <h3>Verified in a real browser, honestly</h3>
              <p className="muted">Every slide and step, dark mode and a phone-width view are rendered and checked. Claude sees the screenshots and fixes what differs from the code; anything that couldn&apos;t run is reported as not run.</p>
              <ul className="checks" aria-hidden>
                <li><span className="chip ok">passed</span>Every slide and step at 1280×720</li>
                <li><span className="chip ok">passed</span>No script errors or clipped text</li>
                <li><span className="chip ok">passed</span>No network requests</li>
                <li><span className="chip ok">passed</span>Dark mode and 390px phone width</li>
              </ul>
            </Spotlight>
          </div>
        </section>

        <section id="product" className="sec">
          <div className="sec-head center">
            <h2>Four steps from code to <span className="accent">demo</span></h2>
            <p className="muted">Two short screens here, one message in Claude or ChatGPT, and the result on your dashboard. Use the arrow keys to move between tabs.</p>
          </div>
          <ProductTabs />
        </section>

        <section id="samples" className="sec">
          <div className="sec-head">
            <h2>Open a sample <span className="accent">full screen</span></h2>
            <p className="muted">Three real repositories, three finished demos, each a single HTML file.</p>
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
            <p className="muted">Repository content is treated as untrusted input, and the assistant only ever reads a scrubbed copy.</p>
          </div>
          <div className="trust-grid">
            {[
              ["Read-only access", "Contents and Metadata read permissions. No write scopes, ever."],
              ["Scrubbed before reading", "Secret files and escaping symlinks are removed from the copy first."],
              ["Tokens stay on the server", "Azure DevOps, GitLab and Bitbucket tokens are encrypted here and never sent to Claude or ChatGPT."],
              ["Previews can't phone home", "Slides are checked with the network off, served with a strict policy and shown in a sandboxed frame."],
            ].map(([t, d]) => <div key={t} className="trust-item"><h4>{t}</h4><p className="muted small">{d}</p></div>)}
          </div>
        </section>

        <section id="faq" className="sec">
          <div className="sec-head"><h2>Questions, answered</h2></div>
          <Faq />
        </section>

        <section className="cta">
          <h2>Your next review deserves a demo people can <span className="accent">click.</span></h2>
          <p className="muted">Set up once with GitHub and Claude or ChatGPT. After that, every demo starts from one short form.</p>
          <Link href="/dashboard" className="btn primary lg">Get started</Link>
        </section>
      </main>
      <footer className="lf">
        <div className="lf-in">
          <div><Link href="/" className="brand"><BrandMark />{BRAND_NAME}</Link><p className="small muted">Interactive demos, rebuilt from your real code.</p></div>
          <nav className="row small" aria-label="Footer"><a href="#features">Features</a><a href="#how">How it works</a><a href="#trust">Safety</a><a href="#faq">FAQ</a><Link href="/dashboard">Dashboard</Link></nav>
          <nav className="lf-social small" aria-label="Elsewhere">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer"><GitHubIcon />Source on GitHub</a>
            <a href={LINKEDIN_URL} target="_blank" rel="noreferrer"><LinkedInIcon />{AUTHOR} on LinkedIn</a>
          </nav>
        </div>
        <p className="small muted lf-copy">© 2026 {BRAND_NAME}, built by <a href={LINKEDIN_URL} target="_blank" rel="noreferrer">{AUTHOR}</a>. Sample data on this page is illustrative.</p>
      </footer>
    </div>
  );
}
