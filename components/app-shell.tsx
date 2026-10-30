"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { BrandMark, BRAND_NAME } from "./brand";
import { SocialLinks } from "./social";
import { ThemeToggle } from "./theme-toggle";
import { GithubConnection } from "./github-connection";
import { RepositoryPicker } from "./repository-picker";
import { DemoConfigurationForm } from "./demo-configuration-form";
import { GenerationProgress } from "./generation-progress";
import { ArtifactPreview } from "./artifact-preview";
import type { Repo } from "@/types/github";
import type { RunRecord, RunStatus } from "@/types/run";

interface Me { user: { login: string; avatarUrl: string | null } | null; installUrl: string | null; devMode?: boolean }
interface Health { githubAppConfigured: boolean; devAuthBypass: boolean }
type View = "loading" | "connect" | "pick" | "configure" | "progress" | "result";
const KEY = "ds_run";
const STATUS_CHIP: Record<RunStatus, string> = { queued: "warn", running: "warn", succeeded: "ok", failed: "bad", cancelled: "", interrupted: "bad" };
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

export function AppShell() {
  const [view, setView] = useState<View>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [branch, setBranch] = useState("");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const refreshHistory = useCallback(async () => {
    const d = await api<{ runs: RunRecord[] }>("/api/runs").catch(() => null);
    if (d) setHistory(d.runs);
  }, []);

  const load = useCallback(async () => {
    const [m, h] = await Promise.all([api<Me>("/api/me").catch(() => null), api<Health>("/api/health").catch(() => null)]);
    setAuthError(new URLSearchParams(location.search).get("auth_error"));
    setMe(m); setHealth(h);
    if (!m?.user) return setView("connect");
    refreshHistory();
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
    if (saved) {
      const r = await api<{ run: RunRecord }>(`/api/runs/${saved}`).catch(() => null);
      if (r) { setRun(r.run); return setView(r.run.status === "queued" || r.run.status === "running" ? "progress" : "result"); }
    }
    setView("pick");
  }, [refreshHistory]);

  // Initial data fetch; state is only set after the awaited requests resolve.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const remember = (id: string | null) => { try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* ignore */ } };
  async function signOut() { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); remember(null); setMe(null); setHistory([]); setView("connect"); }
  function newDemo() { remember(null); setRun(null); setRepo(null); setMenu(false); setView("pick"); }
  function openRun(r: RunRecord) { remember(r.id); setRun(r); setMenu(false); setView(r.status === "queued" || r.status === "running" ? "progress" : "result"); }

  const step = view === "pick" ? 1 : view === "configure" ? 2 : view === "progress" ? 3 : view === "result" ? 4 : 0;
  const signedIn = Boolean(me?.user);

  return (
    <div className="ap">
      <div className="ap-bg" aria-hidden />
      <aside className={`ap-side ${menu ? "open" : ""}`}>
        <div className="ap-side-top">
          <Link href="/" className="brand"><BrandMark />{BRAND_NAME}</Link>
          <button className="ap-burger" aria-label="Toggle menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><span /><span /></button>
        </div>
        <div className="ap-side-body">
          {signedIn && <button className="btn primary ap-new" onClick={newDemo}>New demo</button>}
          {signedIn && <Link className="btn ghost sm" href="/dashboard">Dashboard</Link>}
          {signedIn && (
            <nav aria-label="Your demos" className="ap-hist">
              <p className="eyebrow">Your demos</p>
              {history.length === 0 && <p className="small muted">Demos you generate will appear here.</p>}
              {history.slice(0, 12).map((r) => (
                <button key={r.id} className={`ap-hist-item ${run?.id === r.id && (view === "progress" || view === "result") ? "on" : ""}`} onClick={() => openRun(r)}>
                  <span className="ap-hist-title">{r.title}</span>
                  <span className="ap-hist-meta mono"><span className={`chip ${STATUS_CHIP[r.status]}`}>{r.status}</span>{r.repo} · {ago(r.createdAt)}</span>
                </button>
              ))}
            </nav>
          )}
          <div className="ap-side-foot">
            <div className="row spread">
              <SocialLinks />
              <ThemeToggle />
              {me?.user && (
                <div className="row" style={{ gap: ".5rem" }}>
                  {me.user.avatarUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="avatar" src={me.user.avatarUrl} alt="" />
                    </>
                  )}
                  <span className="small mono">{me.user.login}</span>
                </div>
              )}
            </div>
            {me?.devMode && <span className="chip warn">dev mode</span>}
            {signedIn && <button className="btn ghost sm" onClick={signOut}>Sign out</button>}
          </div>
        </div>
      </aside>

      <main className="ap-main">
        {step > 0 && (
          <ol className="stepper" aria-label="Progress through the flow">
            {["Repository", "Configure", "Generate", "Result"].map((s, i) => (
              <li key={s} className={i + 1 === step ? "on" : i + 1 < step ? "done" : ""} aria-current={i + 1 === step ? "step" : undefined}>
                <span className="stepper-n mono">{i + 1 < step ? "✓" : i + 1}</span>{s}
              </li>
            ))}
          </ol>
        )}
        <div key={view} className="ap-view">
          {view === "loading" && <div className="ap-skel" aria-live="polite" aria-label="Loading"><i /><i /><i /></div>}
          {view === "connect" && <GithubConnection health={health} error={authError} onRetry={() => { setView("loading"); void load(); }} />}
          {view === "pick" && (
            <div className="stack">
              <div><h1 className="ap-h">Choose a repository</h1><p className="muted">Pick the application you want to turn into a demo.</p></div>
              <RepositoryPicker installUrl={me?.installUrl ?? null} selected={repo} branch={branch} onSelect={(r) => { setRepo(r); setBranch(r.defaultBranch); }} onBranch={setBranch} />
              <div className="ap-sticky"><button className="btn primary lg" disabled={!repo} onClick={() => setView("configure")}>{repo ? `Continue with ${repo.name}` : "Select a repository to continue"}</button></div>
            </div>
          )}
          {view === "configure" && repo && <DemoConfigurationForm repo={repo} branch={branch} onBack={() => setView("pick")} onStarted={(r) => { remember(r.id); setRun(r); refreshHistory(); setView("progress"); }} />}
          {view === "progress" && run && (
            <GenerationProgress run={run} onFinished={async () => {
              const r = await api<{ run: RunRecord }>(`/api/runs/${run.id}`).catch(() => null);
              if (r) setRun(r.run);
              refreshHistory();
              setView("result");
            }} />
          )}
          {view === "result" && run && <ArtifactPreview run={run} onNew={newDemo} />}
        </div>
      </main>
    </div>
  );
}
