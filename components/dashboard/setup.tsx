"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sileo } from "sileo";
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

/** One-time setup: GitHub, the Claude or ChatGPT connector and its tool permissions, then other code hosts. */
export function Setup() {
  const { data, signedOut, error, load, connected } = useDashboard();
  const [waiting, setWaiting] = useState(false);
  const [picked, setTab] = useState<"claude" | "chatgpt" | null>(null);
  const [installing, setInstalling] = useState(false);
  const g = data?.github;
  // Signed in, but the GitHub App can't read any repository yet: that is the first thing to fix.
  const needsInstall = Boolean(g?.installUrl && g.installations === 0);
  // After "Choose repositories" opens GitHub, check every few seconds until an installation shows up.
  useEffect(() => {
    if (!installing || !needsInstall) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 4000);
    return () => clearInterval(id);
  }, [installing, needsInstall, load]);
  // Say so when an assistant or the GitHub App gets connected while this page is open.
  const router = useRouter();
  const before = useRef<{ assistants: string[]; installations: number | null } | null>(null);
  useEffect(() => {
    if (!data) return;
    const was = before.current;
    before.current = { assistants: data.connector.assistants, installations: data.github.installations };
    if (!was) return;
    for (const a of ["claude", "chatgpt"] as const) {
      if (!data.connector.assistants.includes(a) || was.assistants.includes(a)) continue;
      sileo.action({ title: `${a === "claude" ? "Claude" : "ChatGPT"} connected`, description: "You can build a demo now.", button: { title: "Build a demo", onClick: () => router.push("/dashboard") } });
    }
    if (was.installations === 0 && (data.github.installations ?? 0) > 0) sileo.success({ title: "Repositories connected", description: "antm can now read the repositories you chose on GitHub." });
  }, [data, router]);
  if (signedOut) return <SignedOutGate />;
  const has = (a: "claude" | "chatgpt") => data?.connector.assistants.includes(a) ?? false;
  // Show the assistant the user picked, else one that's connected, else Claude.
  const tab = picked ?? (!has("claude") && has("chatgpt") ? "chatgpt" : "claude");
  const last = data?.connector.lastUsedAt ? `Last used ${ago(data.connector.lastUsedAt)}.` : "Not used yet.";

  return (
    <Frame page="setup" data={data}>
      <section className="dx-hero">
        <h1>{connected ? "You're all set" : "Set up once, in three steps"}</h1>
        <p className="dx-lede">Connect your code and your Claude or ChatGPT account. After this, every demo starts from one short form.</p>
      </section>
      {error && <div className="notice bad" role="alert">{error}</div>}

      {!data ? <Loading /> : (
        <>
          <ol className="dx-steps">
            <li className={`dx-step ${needsInstall ? "on" : "done"}`}>
              <span className="dx-step-n" aria-hidden>{needsInstall ? 1 : "✓"}</span>
              <div className="dx-step-body">
                {needsInstall ? (
                  <>
                    <h2>Choose the repositories antm may read</h2>
                    <p className="muted">You&apos;re signed in as <span className="mono">{data.user.login}</span>. Now install the antm GitHub App on your account or organization and pick the repositories to demo. It gets read-only access, and you can change the list on GitHub any time.</p>
                    <div className="row">
                      <a className="btn primary" href={g!.installUrl!} target="_blank" rel="noreferrer" onClick={() => setInstalling(true)}>Choose repositories on GitHub</a>
                      <span className="small muted" role="status" aria-live="polite">{installing ? <><span className="dot-live" /> Waiting for GitHub…</> : null}</span>
                    </div>
                    <p className="small muted">Code on Azure DevOps, GitLab or Bitbucket, or in a zip file? You can skip this and add a token below instead.</p>
                  </>
                ) : (
                  <>
                    <h2>Sign in with GitHub</h2>
                    <p className="muted">Signed in as <span className="mono">{data.user.login}</span>.</p>
                    {g?.installUrl && (
                      <p className="muted">
                        {g.installations === null ? "Couldn't check the GitHub App right now." : `The GitHub App can read repositories on ${g.installations} account${g.installations === 1 ? "" : "s"}.`}{" "}
                        <a href={g.installUrl} target="_blank" rel="noreferrer">Choose repositories</a>
                      </p>
                    )}
                  </>
                )}
              </div>
            </li>

            <li className={`dx-step ${connected ? "done" : "on"}`}>
              <span className="dx-step-n" aria-hidden>{connected ? "✓" : 2}</span>
              <div className="dx-step-body">
                <h2>Connect Claude or ChatGPT</h2>
                <p className="muted">Pick the assistant you use; you can connect both. It writes the demo on your own plan and reaches this site through the connector.</p>
                <div className="nd-tabs" role="tablist" aria-label="Assistant">
                  {(["claude", "chatgpt"] as const).map((a) => (
                    <button key={a} type="button" role="tab" aria-selected={tab === a} className={tab === a ? "on" : ""} onClick={() => setTab(a)}>
                      {a === "claude" ? "Claude" : "ChatGPT"}{has(a) && <span className="dx-ok" aria-label="(connected)"> ✓</span>}
                    </button>
                  ))}
                </div>

                {tab === "claude" && (has("claude") ? (
                  <p className="muted"><span className="chip ok">connected</span> {last} Removed it in claude.ai? <a href={data.connector.installUrl} target="_blank" rel="noreferrer">Add it again</a>.</p>
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
                ))}

                {tab === "chatgpt" && (has("chatgpt") ? (
                  <p className="muted"><span className="chip ok">connected</span> {last} Removed the plugin in ChatGPT? Add it again with the steps below.</p>
                ) : (
                  <>
                    <ol className="dx-howto">
                      <li>In ChatGPT, turn on <strong>Developer mode</strong> (Settings; paid plans). Workspace admins may need to allow custom plugins.</li>
                      <li>Open <a href={data.connector.chatgptPluginsUrl} target="_blank" rel="noreferrer">ChatGPT plugins</a>, click <strong>+</strong> and choose <strong>Add custom MCP server</strong>.</li>
                      <li>Name it <span className="mono">{data.connector.name}</span> <Copy text={data.connector.name} /> and enter the URL <span className="mono">{data.connector.mcpUrl}</span> <Copy text={data.connector.mcpUrl} /></li>
                      <li>Choose <strong>OAuth</strong> for authentication, confirm, then <strong>Create as a plugin</strong> and install it.</li>
                      <li>Sign in with GitHub when asked and click <strong>Allow</strong>. This page updates by itself.</li>
                    </ol>
                    <div className="row">
                      <a className="btn primary" href={data.connector.chatgptPluginsUrl} target="_blank" rel="noreferrer" onClick={() => setWaiting(true)}>Open ChatGPT plugins</a>
                      <span className="small muted" role="status" aria-live="polite">{waiting ? <><span className="dot-live" /> Waiting for ChatGPT…</> : null}</span>
                    </div>
                  </>
                ))}
              </div>
            </li>

            <li className={`dx-step ${connected ? "on" : ""}`}>
              <span className="dx-step-n" aria-hidden>3</span>
              <div className="dx-step-body">
                <h2>Let builds run without interruptions</h2>
                {tab === "claude" ? (
                  <>
                    <p className="muted">claude.ai asks before each connector tool by default. Open the connector in claude.ai and set its tool permissions to <strong>Always allow</strong>. You can also choose <strong>Always allow</strong> the first time a build asks.</p>
                    <div><a className="btn" href={CONNECTORS_URL} target="_blank" rel="noreferrer">Open connector settings</a></div>
                  </>
                ) : (
                  <p className="muted">ChatGPT asks you to confirm each step that saves part of the demo. Approve them as they come up; where ChatGPT offers to remember the choice for the conversation, accept it so the build keeps going.</p>
                )}
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

        </>
      )}
    </Frame>
  );
}
