import Link from "next/link";
import "./landing.css";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSamples } from "@/components/landing/hero-samples";
import { ChatGPTIcon, ClaudeIcon } from "@/components/assistant-icons";
import { ProductTabs } from "@/components/landing/product-tabs";
import { Faq } from "@/components/landing/faq";
import { BrandMark, BRAND_NAME } from "@/components/brand";
import { SAMPLES } from "@/lib/samples";
import { AUTHOR, GITHUB_URL, GitHubIcon, LINKEDIN_URL, LinkedInIcon } from "@/components/social";

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

// What antm can and can't do with your code. Each line is enforced in code, not policy.
const SAFETY = [
  ["Read-only access", "The GitHub App asks for Contents and Metadata, read-only. antm never commits, pushes or opens anything on GitHub."],
  ["A scrubbed copy", "Files that look like secrets (.env, keys, credentials) and links that point outside the repository are removed before your assistant can read anything."],
  ["Tokens stay here", "Azure DevOps, GitLab and Bitbucket tokens are encrypted on this server and never sent to Claude or ChatGPT."],
  ["No model calls", "antm doesn't call an AI model and never sees your chat. The assistant runs in your own account, on your plan."],
  ["Checked offline", "Slides are rendered with the network switched off, served with a strict content policy and previewed in a sandboxed frame."],
  ["Cleaned up", "The copy fetched for a build is deleted after 14 days without use. Your demos stay until you delete them."],
] as const;

export default function Landing() {
  const lead = SAMPLES[0];
  return (
    <div className="lp">
      <LandingNav />
      <main>
        <section className="hero" aria-labelledby="hero-h">
          <div className="hero-head">
            <h1 id="hero-h">Demo your product from its own code.</h1>
            <div className="hero-side">
              <p className="lede">Pick a repository. Claude or ChatGPT rebuilds its real screens as a click-through presentation, antm checks every slide in Chrome, and you get one HTML file that opens anywhere.</p>
              <div className="row hero-cta">
                <Link href="/dashboard" className="btn primary lg">Build a demo</Link>
                <Link href="/samples" className="btn lg">See the samples</Link>
              </div>
              <p className="works small">Works with <span><ClaudeIcon /> Claude</span> and <span><ChatGPTIcon /> ChatGPT</span>, on your own plan.</p>
            </div>
          </div>
          <HeroSamples samples={SAMPLES} />
        </section>

        <section id="how" className="sec" aria-labelledby="how-h">
          <div className="sec-head">
            <h2 id="how-h">How a demo gets made</h2>
            <p>Two short screens here, one message in your assistant, and the finished demo on your dashboard.</p>
          </div>
          <ProductTabs />
        </section>

        <section id="output" className="sec split" aria-labelledby="out-h">
          <div className="sec-head">
            <h2 id="out-h">One file, and the proof that it works</h2>
            <p>Every demo is a single HTML file with its styles, scripts and images inside. Send it, attach it, or open it on a plane. Two reports come with it: what was checked, and where every figure came from.</p>
          </div>
          {lead && (
            <figure className="receipt">
              <figcaption><span className="mono">{lead.slug}.html</span><Link href={`/samples/${lead.slug}`} className="small">Open it</Link></figcaption>
              <dl>
                <div><dt>Size</dt><dd>{kb(lead.bytes)}, one file</dd></div>
                <div><dt>Built from</dt><dd className="mono">{lead.repo}</dd></div>
                <div><dt>Views checked in Chrome</dt><dd>{lead.screenshots}, at desktop and phone widths</dd></div>
                <div><dt>Network requests</dt><dd>None. Fonts, images and scripts are embedded</dd></div>
                <div><dt>Colour mode</dt><dd>Light or dark, chosen when you start</dd></div>
                <div><dt>Reports</dt><dd>Verification report and evidence report, in Markdown</dd></div>
              </dl>
            </figure>
          )}
        </section>

        <section id="security" className="sec split" aria-labelledby="sec-h">
          <div className="sec-head">
            <h2 id="sec-h">What antm can and can&apos;t touch</h2>
            <p>Repository content is treated as untrusted input. Your assistant only ever reads a scrubbed, read-only copy.</p>
          </div>
          <dl className="facts">
            {SAFETY.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
          </dl>
        </section>

        <section id="samples" className="sec" aria-labelledby="smp-h">
          <div className="sec-head">
            <h2 id="smp-h">Samples built from real repositories</h2>
            <p>Each one came out of a single build. Open it full screen and click around.</p>
          </div>
          <ul className="sample-rows">
            {SAMPLES.map((s) => (
              <li key={s.slug}>
                <Link href={`/samples/${s.slug}`} className="sample-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/samples/${s.slug}.png`} alt="" loading="lazy" />
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.tagline}</p>
                    <p className="small sample-meta"><span className="mono">{s.repo}</span> <span>{kb(s.bytes)}</span> <span>{s.screenshots} views checked</span></p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" className="sec split" aria-labelledby="faq-h">
          <div className="sec-head"><h2 id="faq-h">Questions</h2><p>Anything else? <a href={GITHUB_URL} target="_blank" rel="noreferrer">Open an issue on GitHub</a>.</p></div>
          <Faq />
        </section>

        <section className="closing" aria-labelledby="end-h">
          <h2 id="end-h">Build your first demo</h2>
          <p>Sign in with GitHub, connect Claude or ChatGPT, and fill in one short form.</p>
          <Link href="/dashboard" className="btn primary lg">Build a demo</Link>
        </section>
      </main>
      <footer className="lf">
        <div className="lf-in">
          <div><Link href="/" className="brand"><BrandMark />{BRAND_NAME}</Link><p className="small">Click-through demos, rebuilt from your code.</p></div>
          <nav className="lf-nav small" aria-label="Footer"><Link href="/samples">Samples</Link><a href="#how">How it works</a><a href="#security">Security</a><a href="#faq">FAQ</a><Link href="/dashboard">Dashboard</Link></nav>
          <nav className="lf-social small" aria-label="Elsewhere">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer"><GitHubIcon />Source on GitHub</a>
            <a href={LINKEDIN_URL} target="_blank" rel="noreferrer"><LinkedInIcon />{AUTHOR} on LinkedIn</a>
          </nav>
        </div>
        <p className="small lf-copy">© 2026 {BRAND_NAME}, built by <a href={LINKEDIN_URL} target="_blank" rel="noreferrer">{AUTHOR}</a>. Sample data inside the demos is labelled illustrative.</p>
      </footer>
    </div>
  );
}
