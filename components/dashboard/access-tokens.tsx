"use client";
import { useState } from "react";
import { sileo } from "sileo";
import { api } from "@/lib/client";

export interface Credential { id: string; provider: "azure" | "gitlab" | "bitbucket"; host: string; label: string; username: string; createdAt: number }

const PROVIDERS: { host: string; name: string; help: string; username: string }[] = [
  { host: "dev.azure.com", name: "Azure DevOps", username: "pat", help: "User settings → Personal access tokens → New token, scope Code: Read. For *.visualstudio.com organisations, enter that host instead." },
  { host: "gitlab.com", name: "GitLab", username: "oauth2", help: "Preferences → Access tokens, scope read_repository. For self-hosted GitLab, enter your server's host (it must be listed in GIT_EXTRA_HOSTS)." },
  { host: "bitbucket.org", name: "Bitbucket", username: "x-token-auth", help: "Repository or workspace access token with Repositories: Read. To use an app password instead, set the username to your Bitbucket username." },
];

/** Read-only tokens for Azure DevOps, GitLab and Bitbucket. Sealed on the server; never sent to Claude or ChatGPT. */
export function AccessTokens({ credentials, onChange, embedded = false }: { credentials: Credential[]; onChange: () => Promise<void>; embedded?: boolean }) {
  const [form, setForm] = useState({ host: PROVIDERS[0].host, label: "", username: "", token: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = PROVIDERS.find((p) => p.host === form.host);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/api/connector/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setForm({ ...form, label: "", username: "", token: "" });
      sileo.success({ title: "Token saved", description: `Repositories on ${form.host} can now be fetched with it.` });
      await onChange();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api(`/api/connector/credentials/${id}`, { method: "DELETE" });
      sileo.success({ title: "Token removed" });
      await onChange();
    } catch (err) { sileo.error({ title: "Couldn't remove the token", description: (err as Error).message, duration: 10_000 }); }
  }

  return (
    <section id={embedded ? undefined : "access"} className={embedded ? "stack dx-panel-body" : "card stack"} aria-labelledby={embedded ? undefined : "tok-h"}>
      <div>
        {!embedded && <h2 id="tok-h" className="db-h2">Azure DevOps, GitLab and Bitbucket</h2>}
        <p className="small muted">GitHub works through the GitHub App. For other hosts, save a read-only access token. Tokens are encrypted on this server and are never sent to Claude or ChatGPT.</p>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {credentials.length > 0 && (
        <ul className="db-list">
          {credentials.map((c) => (
            <li key={c.id} className="row spread notice">
              <span><strong>{c.label}</strong> <span className="chip">{c.host}</span> <span className="small muted mono">as {c.username}</span></span>
              <button className="btn sm danger" onClick={() => remove(c.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="stack" noValidate>
        <div className="row" style={{ alignItems: "end" }}>
          <div style={{ flex: "1 1 12rem" }}>
            <label htmlFor="host">Host</label>
            <input id="host" type="text" list="hosts" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
            <datalist id="hosts">{PROVIDERS.map((p) => <option key={p.host} value={p.host}>{p.name}</option>)}</datalist>
          </div>
          <div style={{ flex: "1 1 12rem" }}>
            <label htmlFor="label">Label <span className="muted">(optional)</span></label>
            <input id="label" type="text" value={form.label} maxLength={80} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Contoso Azure DevOps" />
          </div>
        </div>
        <div className="row" style={{ alignItems: "end" }}>
          <div style={{ flex: "2 1 16rem" }}>
            <label htmlFor="token">Access token</label>
            <input id="token" type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
          </div>
          <div style={{ flex: "1 1 10rem" }}>
            <label htmlFor="username">Username <span className="muted">(optional)</span></label>
            <input id="username" type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={provider?.username ?? ""} />
          </div>
        </div>
        {provider && <p className="hint">{provider.name}: {provider.help}</p>}
        <div><button className="btn primary" disabled={busy || !form.token.trim()} type="submit">{busy ? "Saving…" : "Save token"}</button></div>
      </form>
    </section>
  );
}
