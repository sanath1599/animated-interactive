"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { Branch, Repo } from "@/types/github";

interface Props { installUrl: string | null; selected: Repo | null; branch: string; onSelect: (r: Repo) => void; onBranch: (b: string) => void }

export function RepositoryPicker({ installUrl, selected, branch, onSelect, onBranch }: Props) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; list: Branch[] } | null>(null);
  const key = selected ? `${selected.installationId}/${selected.fullName}` : "";
  const branches = loaded?.key === key ? loaded.list : [];

  useEffect(() => {
    api<{ repos: Repo[] }>("/api/github/repos").then((d) => setRepos(d.repos), (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    api<{ branches: Branch[] }>(`/api/github/branches?owner=${selected.owner}&repo=${selected.name}&installationId=${selected.installationId}`)
      .then((d) => setLoaded({ key, list: d.branches }), () => setLoaded({ key, list: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (repos ?? []).filter((r) => !t || r.fullName.toLowerCase().includes(t) || (r.description ?? "").toLowerCase().includes(t));
  }, [repos, q]);

  function useUrl() {
    setUrlError(null);
    const m = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(urlInput.trim());
    const hit = m && repos?.find((r) => r.owner.toLowerCase() === m[1].toLowerCase() && r.name.toLowerCase() === m[2].toLowerCase());
    if (hit) onSelect(hit);
    else setUrlError("That repository isn't available to Demo Studio. Install the GitHub App on it first, then reload this list.");
  }

  return (
    <div className="stack">
      <div>
        <label htmlFor="repo-url">Repository URL</label>
        <div className="row">
          <input id="repo-url" type="text" placeholder="https://github.com/owner/name" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} style={{ flex: 1, minWidth: "14rem" }} />
          <button className="btn" onClick={useUrl} disabled={!urlInput.trim() || !repos}>Use this repository</button>
        </div>
        {urlError && <p className="field-error" role="alert">{urlError}</p>}
      </div>

      <div>
        <label htmlFor="repo-search">Or choose from your repositories</label>
        <input id="repo-search" type="search" placeholder="Search by name or description" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error && <div className="notice bad" role="alert">{error}</div>}
      {!repos && !error && <p className="muted" aria-live="polite">Loading repositories…</p>}
      {repos && repos.length === 0 && (
        <div className="notice warn">
          No repositories are available yet. Install the Demo Studio GitHub App on your account or organization and choose which repositories it can read.{" "}
          {installUrl && <a href={installUrl} target="_blank" rel="noreferrer">Install the app</a>}
        </div>
      )}
      <div className="grid">
        {filtered.map((r) => (
          <button key={`${r.installationId}-${r.id}`} className="card select" aria-pressed={selected?.id === r.id} onClick={() => onSelect(r)}>
            <div className="row spread"><strong>{r.name}</strong><span className={`chip ${r.visibility === "private" ? "warn" : ""}`}>{r.visibility}</span></div>
            <div className="mono small muted">{r.owner}{r.ownerType === "Organization" ? " · org" : ""}</div>
            <p className="small muted" style={{ margin: ".5rem 0 0" }}>{r.description ?? "No description"}</p>
            <div className="mono small muted" style={{ marginTop: ".5rem" }}>default: {r.defaultBranch}</div>
          </button>
        ))}
      </div>
      {repos && repos.length > 0 && filtered.length === 0 && <p className="muted">No repositories match “{q}”.</p>}
      {installUrl && repos && repos.length > 0 && <p className="hint">Missing a repository? <a href={installUrl} target="_blank" rel="noreferrer">Add it to the GitHub App</a>, then reload.</p>}

      {selected && (
        <div className="card">
          <p className="eyebrow">Selected</p>
          <div className="row spread">
            <a href={selected.url} target="_blank" rel="noreferrer"><strong>{selected.fullName}</strong></a>
            <div>
              <label htmlFor="branch" className="small">Branch</label>
              <select id="branch" value={branch} onChange={(e) => onBranch(e.target.value)}>
                {!branches.some((b) => b.name === selected.defaultBranch) && <option value={selected.defaultBranch}>{selected.defaultBranch}</option>}
                {branches.map((b) => <option key={b.name} value={b.name}>{b.name}{b.name === selected.defaultBranch ? " (default)" : ""}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
