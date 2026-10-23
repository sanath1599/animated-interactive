"use client";
import { BrandMark } from "./brand";

interface Props { health: { githubAppConfigured: boolean; devAuthBypass: boolean } | null; error?: string | null; onRetry: () => void }

const MESSAGES: Record<string, string> = {
  state: "That sign-in attempt expired. Try again.",
  denied: "GitHub sign-in was cancelled. Continue with GitHub to try again.",
  exchange: "GitHub didn't accept the sign-in. Try again in a moment.",
  not_configured: "GitHub sign-in isn't set up on this server yet.",
};

export function GithubConnection({ health, error, onRetry }: Props) {
  const configured = health?.githubAppConfigured ?? true;
  return (
    <section className="gate" aria-labelledby="gate-h">
      <div className="gate-card">
        <BrandMark className="gate-mark" />
        <h1 id="gate-h">Connect GitHub to get started</h1>
        <p className="muted">Pick a repository and get an interactive executive demo. Access is read-only, and nothing is ever pushed.</p>
        {error && <div className="notice bad" role="alert">{MESSAGES[error] ?? "Sign-in failed. Try again."}</div>}
        {!configured && <div className="notice warn">GitHub sign-in isn&apos;t configured on this server. An administrator needs to add the GitHub App credentials (see the README).</div>}
        <a className="btn primary lg gate-btn" href="/api/auth/github/login" aria-disabled={!configured}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="6" cy="5" r="2.5" /><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M6 7.5v9M18 10.5c0 4-6 3-11 6" /></svg>
          Continue with GitHub
        </a>
        <button className="btn ghost sm" onClick={onRetry}>Check connection again</button>
        <p className="hint">We request read-only access to the repositories you choose. We never ask you to paste a token.</p>
      </div>
    </section>
  );
}
