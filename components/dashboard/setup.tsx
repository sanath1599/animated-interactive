"use client";
import Link from "next/link";
import { useState } from "react";
import { AccessTokens } from "./access-tokens";
import { Frame, Loading, SignedOutGate } from "./frame";
import { ago, useDashboard } from "./use-dashboard";

const CONNECTORS_URL = "https://claude.ai/customize/connectors";

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn sm" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {})}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/** One-time setup: GitHub, the claude.ai connector and its tool permissions, then other code hosts. */
export function Setup() {
  const { data, signedOut, error, load, connected } = useDashboard();
  const [waiting, setWaiting] = useState(false);
  if (signedOut) return <SignedOutGate />;
  const g = data?.github;

  return (
    <Frame page="setup" data={data}>
      <section className="dx-hero">
        <h1>{connected ? "You're all set" : "Set up once, in three steps"}</h1>
        <p className="dx-lede">Connect your code and your Claude account. After this, every demo starts from one short form.</p>
      </section>
      {error && <div className="notice bad" role="alert">{error}</div>}

      {!data ? <Loading /> : (
        <>
          <ol className="dx-steps">
            <li className="dx-step done">
              <span className="dx-step-n" aria-hidden>✓</span>
              <div className="dx-step-body">
                <h2>Sign in with GitHub</h2>
                <p className="muted">Signed in as <span className="mono">{data.user.login}</span>.</p>
                {g?.installUrl && (
                  <p className="muted">
                    {g.installations === null ? "Couldn't check the GitHub App right now." : g.installations > 0 ? `The GitHub App can read repositories on ${g.installations} account${g.installations === 1 ? "" : "s"}.` : "Next, let the GitHub App read the repositories you want to demo."}{" "}
                    <a href={g.installUrl} target="_blank" rel="noreferrer">{(g.installations ?? 0) > 0 ? "Choose repositories" : "Install the GitHub App"}</a>
                  </p>
                )}
              </div>
            </li>

            <li className={`dx-step ${connected ? "done" : "on"}`}>
              <span className="dx-step-n" aria-hidden>{connected ? "✓" : 2}</span>
              <div className="dx-step-body">
                <h2>Add the connector to Claude</h2>
                {connected ? (
                  <p className="muted"><span className="chip ok">connected</span> {data.connector.lastUsedAt ? `Last used ${ago(data.connector.lastUsedAt)}.` : "Not used yet."} Removed it in claude.ai? <a href={data.connector.installUrl} target="_blank" rel="noreferrer">Add it again</a>.</p>
                ) : (
                  <>
                    <p className="muted">claude.ai opens with everything filled in. Click <strong>Add</strong>, then <strong>Connect</strong>, then <strong>Allow</strong> here.</p>
                    <div className="row">
                      <a className="btn primary" href={data.connector.installUrl} target="_blank" rel="noreferrer" onClick={() => setWaiting(true)}>Add to Claude</a>
                      <span className="small muted" role="status" aria-live="polite">{waiting ? <><span className="dot-live" /> Waiting for claude.ai…</> : null}</span>
                    </div>
                    <details className="dx-more">
                      <summary>Add it by hand instead</summary>
                      <p>In claude.ai open Customize → Connectors → <strong>Add custom connector</strong>.</p>
                      <p>Name <span className="mono">{data.connector.name}</span> <Copy text={data.connector.name} /> (exactly)</p>
                      <p>URL <span className="mono">{data.connector.mcpUrl}</span> <Copy text={data.connector.mcpUrl} /></p>
                    </details>
                  </>
                )}
              </div>
            </li>

            <li className={`dx-step ${connected ? "on" : ""}`}>
              <span className="dx-step-n" aria-hidden>3</span>
              <div className="dx-step-body">
                <h2>Let builds run without interruptions</h2>
                <p className="muted">claude.ai asks before each connector tool by default. Open the connector in claude.ai and set its tool permissions to <strong>Always allow</strong>. You can also choose <strong>Always allow</strong> the first time a build asks.</p>
                <div><a className="btn" href={CONNECTORS_URL} target="_blank" rel="noreferrer">Open connector settings</a></div>
              </div>
            </li>
          </ol>

          {connected && (
            <div className="dx-done">
              <p>Setup is complete.</p>
              <Link className="btn primary lg" href="/dashboard">Build a demo</Link>
            </div>
          )}

          <details className="dx-panel" id="access">
            <summary><span><strong>Azure DevOps, GitLab or Bitbucket</strong><span className="muted small"> · optional</span></span><span className="muted small">{data.credentials.length ? `${data.credentials.length} token${data.credentials.length === 1 ? "" : "s"} saved` : "Add a read-only token"}</span></summary>
            <AccessTokens credentials={data.credentials} onChange={load} embedded />
          </details>

          <details className="dx-panel">
            <summary><span><strong>Other ways to build</strong><span className="muted small"> · advanced</span></span></summary>
            <div className="stack-sm dx-panel-body">
              {data.artifactUrl && <p className="small muted">Same Claude organization as this site&apos;s owner? The <a href={data.artifactUrl} target="_blank" rel="noreferrer">builder artifact</a> runs the whole build inside one claude.ai page.</p>}
              <p className="small muted">Builds can also run entirely on this server: <Link href="/app">server builder</Link>.</p>
            </div>
          </details>
        </>
      )}
    </Frame>
  );
}
