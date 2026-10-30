"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sileo } from "sileo";
import { api, fmtBytes } from "@/lib/client";
import { Select } from "../ui/select";
import type { Credential } from "./access-tokens";

interface Repo { fullName: string; owner: string; name: string; installationId: number; defaultBranch: string; archived: boolean; visibility: string }
type Assistant = "claude" | "chatgpt";
interface Created { generationId: string; label: string; branch: string; prompt: string; assistant: Assistant; chatUrl: string }
const ASSISTANTS: { id: Assistant; name: string }[] = [{ id: "claude", name: "Claude" }, { id: "chatgpt", name: "ChatGPT" }];
const NEXT: Record<Assistant, string[]> = {
  claude: ["Pick Opus or Sonnet in the new claude.ai chat and press send.", "If claude.ai asks to use the connector, choose Always allow.", "Progress and the finished demo appear below."],
  chatgpt: ["ChatGPT opens with your request. If it doesn't use the Animated Technical Interactive plugin, type @, choose it, and send the request again (it's on your clipboard).", "Approve the plugin's actions when ChatGPT asks.", "Progress and the finished demo appear below."],
};
type Tab = "github" | "git" | "zip";
/** The proxy in front of the app accepts request bodies up to 55 MB. */
const MAX_ZIP = 50 * 1024 * 1024;

const DETAIL = [
  { id: "brief", name: "Brief", slides: "4–6 slides", text: "The home screen and the workflows that matter most." },
  { id: "standard", name: "Standard", slides: "One slide per area", text: "Every major area or workflow, three to five steps each." },
  { id: "detailed", name: "Detailed", slides: "Every page and state", text: "All pages and roles, with empty and error states." },
] as const;
type Detail = (typeof DETAIL)[number]["id"];
const LANGUAGES = ["English", "Arabic", "Chinese (Simplified)", "Dutch", "French", "German", "Hindi", "Italian", "Japanese", "Korean", "Portuguese", "Spanish"].map((l) => ({ value: l, label: l }));
const STEPS = ["Code", "Presentation", "Details", "Review"] as const;

const THEMES = [{ id: "light", name: "Light" }, { id: "dark", name: "Dark" }] as const;
type Theme = (typeof THEMES)[number]["id"];

const EMPTY = { title: "", detail: "standard" as Detail, theme: "light" as Theme, audience: "", language: "English", focus: "", exclude: "", details: "", presenter: "", organization: "", date: "" };
type Form = typeof EMPTY;
// The cover byline is usually the same person and company every time, so the last values used are kept in this browser.
const BYLINE_KEY = "nd-byline";
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time, the <input type="date"> format
function initialForm(): Form {
  let saved: { presenter?: unknown; organization?: unknown } = {};
  try { saved = JSON.parse(localStorage.getItem(BYLINE_KEY) ?? "{}") ?? {}; } catch { /* storage blocked or corrupt: start blank */ }
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : "");
  return { ...EMPTY, presenter: str(saved.presenter), organization: str(saved.organization), date: today() };
}
const fmtDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * Four short steps here, then Claude or ChatGPT: the server starts fetching the code as soon as the request is
 * made, and a new chat opens with a one-line prompt in it. The assistant does the rest through the connector.
 */
export function NewDemo({ credentials, connected, onCreated }: { credentials: Credential[]; connected: string[]; onCreated: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  // Default to an assistant that is already connected, Claude first.
  const [assistant, setAssistant] = useState<Assistant>(!connected.includes("claude") && connected.includes("chatgpt") ? "chatgpt" : "claude");
  const [tab, setTab] = useState<Tab>("github");
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState("");
  const [git, setGit] = useState({ url: "", branch: "", credentialId: "" });
  const [zip, setZip] = useState<File | null>(null);
  const [form, setForm] = useState<Form>(initialForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    api<{ repos: Repo[] }>("/api/github/repos")
      .then((r) => setRepos(r.repos.filter((x) => !x.archived)))
      .catch((e) => { setRepos([]); setRepoError((e as Error).message); });
  }, []);

  async function pickRepo(r: Repo) {
    setRepo(r); setBranch(r.defaultBranch); setBranches(null);
    const q = new URLSearchParams({ owner: r.owner, repo: r.name, installationId: String(r.installationId) });
    const b = await api<{ branches: { name: string }[] }>(`/api/github/branches?${q}`).catch(() => null);
    const names = b?.branches.map((x) => x.name) ?? [];
    setBranches([r.defaultBranch, ...names.filter((n) => n !== r.defaultBranch)]);
  }

  const sourceReady = tab === "github" ? Boolean(repo) : tab === "git" ? /^https:\/\/\S+$/.test(git.url.trim()) : Boolean(zip && zip.size <= MAX_ZIP);
  const source = tab === "github" ? (repo ? `${repo.fullName}, ${branch}` : "") : tab === "git" ? git.url.trim().replace(/^https:\/\//, "") + (git.branch ? `, ${git.branch}` : "") : zip?.name ?? "";
  const canGo = [sourceReady, form.title.trim().length > 0, true, true];
  const extras = Object.entries(form).some(([k, v]) => !["title", "detail", "theme", "language"].includes(k) && v) || form.language !== "English";

  async function submit() {
    if (busy) return;
    setError(null);
    // Open the tab now, while the click still counts as a user gesture; it is pointed at the chat once the server answers.
    const win = window.open("", "_blank");
    const start = async () => {
      let src: unknown;
      if (tab === "github") src = { type: "github", repo: repo!.fullName, branch: branch || undefined };
      else if (tab === "git") src = { type: "git", url: git.url.trim(), branch: git.branch.trim() || undefined, credentialId: git.credentialId || undefined };
      else {
        setBusy(`Uploading ${fmtBytes(zip!.size)}…`);
        const up = await api<{ uploadId: string }>(`/api/dashboard/uploads?name=${encodeURIComponent(zip!.name)}`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: zip });
        src = { type: "upload", uploadId: up.uploadId, name: zip!.name.replace(/\.zip$/i, "") };
      }
      setBusy("Preparing…");
      const c = await api<Created>("/api/dashboard/demos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: src, ...form, assistant, date: fmtDate(form.date) }),
      });
      return c;
    };
    try {
      const c = await sileo.promise(start, {
        loading: { title: tab === "zip" ? "Uploading your code" : "Setting up your demo" },
        success: (r: Created) => ({ title: "Demo request ready", description: r.assistant === "chatgpt" ? "ChatGPT opened in a new tab. The request is on your clipboard too." : "Claude opened in a new tab with the request typed in." }),
        error: (e) => ({ title: "Couldn't start the demo", description: (e as Error).message, duration: 10_000 }),
      });
      try { localStorage.setItem(BYLINE_KEY, JSON.stringify({ presenter: form.presenter.trim(), organization: form.organization.trim() })); } catch { /* not saved: next form starts blank */ }
      setCreated(c);
      // ChatGPT may need the request pasted again after its plugin is picked with @, so keep it on the clipboard.
      if (assistant === "chatgpt") navigator.clipboard?.writeText(c.prompt).catch(() => {});
      if (win) { win.opener = null; win.location.href = c.chatUrl; }
      await onCreated();
    } catch (err) {
      win?.close();
      setError((err as Error).message);
    } finally { setBusy(null); }
  }

  function reset() { setCreated(null); setStep(0); setForm(initialForm()); setRepo(null); setZip(null); setFilter(""); setGit({ url: "", branch: "", credentialId: "" }); }

  if (created) {
    return (
      <section className="nd nd-sent" aria-live="polite">
        <div className="nd-sent-copy">
          <h2>Your request is waiting in {created.assistant === "chatgpt" ? "ChatGPT" : "claude.ai"}</h2>
          <ol className="nd-next">{NEXT[created.assistant].map((t) => <li key={t}>{t}</li>)}</ol>
          <div className="row">
            <a className="btn primary" href={created.chatUrl} target="_blank" rel="noreferrer">Open the chat again</a>
            <CopyText text={created.prompt} />
            <button className="btn ghost" type="button" onClick={reset}>Start another demo</button>
          </div>
        </div>
        <Cover form={form} source={source} />
      </section>
    );
  }

  const shown = (repos ?? []).filter((r) => !filter || r.fullName.toLowerCase().includes(filter.toLowerCase())).slice(0, 60);

  return (
    <section className="nd" aria-labelledby="nd-h">
      <div className="nd-form">
        <div className="nd-head">
          <h2 id="nd-h">New demo</h2>
          <ol className="nd-steps" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? "on" : i < step ? "done" : ""}>
                <button type="button" aria-current={i === step ? "step" : undefined} disabled={i > step && !canGo.slice(0, i).every(Boolean)} onClick={() => setStep(i)}>
                  <span className="nd-n" aria-hidden>{i < step ? "✓" : i + 1}</span>{s}
                </button>
              </li>
            ))}
          </ol>
        </div>
        {error && <div className="notice bad" role="alert">{error}</div>}

        <div className="nd-body" key={step}>
          {step === 0 && (
            <>
              <p className="nd-q">Source code</p>
              <div className="nd-tabs" role="tablist" aria-label="Where the code is">
                {([["github", "GitHub"], ["git", "Azure DevOps, GitLab, Bitbucket"], ["zip", "Zip file"]] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>
              {tab === "github" && (
                repos === null ? <p className="small muted">Loading your repositories…</p>
                  : repoError ? <div className="notice bad">{repoError}</div>
                  : repos.length === 0 ? <p className="small muted">The GitHub App can&apos;t read any repositories yet. <Link href="/dashboard/setup">Choose some on the setup page</Link>.</p>
                  : (
                    <>
                      <div className="nd-search">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                        <input aria-label="Search repositories" type="search" placeholder={`Search ${repos.length} repositories`} value={filter} onChange={(e) => setFilter(e.target.value)} />
                      </div>
                      <div className="nd-repos" role="listbox" aria-label="Repositories">
                        {shown.length === 0 && <p className="small muted nd-pad">No repository matches “{filter}”.</p>}
                        {shown.map((r) => (
                          <button key={r.fullName} type="button" role="option" aria-selected={repo?.fullName === r.fullName} className={repo?.fullName === r.fullName ? "on" : ""} onClick={() => pickRepo(r)}>
                            <span className="nd-repo"><span className="muted">{r.owner}/</span>{r.name}</span>
                            {r.visibility === "private" && <span className="nd-tag">Private</span>}
                          </button>
                        ))}
                      </div>
                      {repo && (
                        <Select label="Branch" value={branch} onChange={setBranch} searchable disabled={!branches}
                          placeholder={branches ? "Choose a branch" : "Loading branches…"}
                          options={(branches ?? [branch]).map((b, i) => ({ value: b, label: b, hint: i === 0 ? "default" : undefined }))} />
                      )}
                    </>
                  )
              )}
              {tab === "git" && (
                <>
                  <div>
                    <label htmlFor="git-url">Repository URL</label>
                    <input id="git-url" type="url" placeholder="https://dev.azure.com/org/project/_git/repo" value={git.url} onChange={(e) => setGit({ ...git, url: e.target.value })} />
                  </div>
                  <div className="nd-grid">
                    <div>
                      <label htmlFor="git-branch">Branch</label>
                      <input id="git-branch" type="text" placeholder="Default branch" value={git.branch} onChange={(e) => setGit({ ...git, branch: e.target.value })} />
                    </div>
                    <Select label="Access token" value={git.credentialId} onChange={(v) => setGit({ ...git, credentialId: v })}
                      options={[{ value: "", label: "Match by host" }, ...credentials.map((c) => ({ value: c.id, label: c.label, hint: c.host }))]} />
                  </div>
                  <p className="hint">Private repositories need a read-only token. <Link href="/dashboard/setup#access">Add one on the setup page</Link>.</p>
                </>
              )}
              {tab === "zip" && (
                <label className={`nd-drop ${zip ? "has" : ""}`}>
                  <input type="file" accept=".zip,application/zip" onChange={(e) => setZip(e.target.files?.[0] ?? null)} />
                  <strong>{zip ? zip.name : "Choose a .zip of the project folder"}</strong>
                  <span className="small muted">{zip ? fmtBytes(zip.size) : "Up to 50 MB. Leave out node_modules and build output; files that look like secrets are removed."}</span>
                  {zip && zip.size > MAX_ZIP && <span className="small bad-text" role="alert">Over the 50 MB limit.</span>}
                </label>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <label htmlFor="nd-title" className="nd-q">Title</label>
                <input id="nd-title" className="nd-big" type="text" maxLength={120} autoFocus value={form.title} onChange={set("title")} placeholder="Product walkthrough" />
              </div>
              <div role="radiogroup" aria-labelledby="nd-detail" className="nd-stack">
                <span id="nd-detail" className="nd-q">Coverage</span>
                <div className="nd-choices">
                  {DETAIL.map((d) => (
                    <label key={d.id} className={`nd-choice ${form.detail === d.id ? "on" : ""}`}>
                      <input type="radio" name="detail" value={d.id} checked={form.detail === d.id} onChange={() => setForm({ ...form, detail: d.id })} />
                      <Bars level={DETAIL.indexOf(d) + 1} />
                      <strong>{d.name}</strong>
                      <span className="small">{d.slides}</span>
                      <span className="small muted">{d.text}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div role="radiogroup" aria-labelledby="nd-theme" className="nd-stack">
                <span id="nd-theme" className="nd-q">Colour mode</span>
                <div className="nd-tabs">
                  {THEMES.map((t) => (
                    <button key={t.id} type="button" role="radio" aria-checked={form.theme === t.id} className={form.theme === t.id ? "on" : ""} onClick={() => setForm({ ...form, theme: t.id })}>{t.name}</button>
                  ))}
                </div>
                <p className="hint">The deck is built in this mode only, with no light/dark switch for viewers.</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="nd-q">Extra details <span className="muted">(optional)</span></p>
              <div className="nd-grid">
                <div>
                  <label htmlFor="nd-aud">Audience</label>
                  <input id="nd-aud" type="text" maxLength={200} value={form.audience} onChange={set("audience")} placeholder="Executive leadership" />
                </div>
                <Select label="Slide language" value={form.language} onChange={(v) => setForm({ ...form, language: v })} options={LANGUAGES} allowCustom />
              </div>
              <div className="nd-grid">
                <div>
                  <label htmlFor="nd-focus">Focus on</label>
                  <textarea id="nd-focus" rows={2} maxLength={2000} value={form.focus} onChange={set("focus")} placeholder="Workflows or scenarios to walk through" />
                </div>
                <div>
                  <label htmlFor="nd-excl">Leave out</label>
                  <textarea id="nd-excl" rows={2} maxLength={2000} value={form.exclude} onChange={set("exclude")} placeholder="Admin pages, unfinished features" />
                </div>
              </div>
              <div>
                <label htmlFor="nd-notes">Notes for the assistant</label>
                <textarea id="nd-notes" rows={2} maxLength={4000} value={form.details} onChange={set("details")} placeholder="Slide order, the story to tell, sample data to use" />
              </div>
              <div className="nd-grid nd-grid3">
                <div>
                  <label htmlFor="nd-pres">Presenter</label>
                  <input id="nd-pres" type="text" maxLength={80} value={form.presenter} onChange={set("presenter")} placeholder="Your name" autoComplete="name" />
                </div>
                <div>
                  <label htmlFor="nd-org">Organization</label>
                  <input id="nd-org" type="text" maxLength={80} value={form.organization} onChange={set("organization")} placeholder="Company or client" autoComplete="organization" />
                </div>
                <div>
                  <label htmlFor="nd-date">Date</label>
                  <input id="nd-date" type="date" value={form.date} onChange={set("date")} />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="nd-q">Review</p>
              <dl className="nd-review">
                <div><dt>Code</dt><dd>{source}</dd><button type="button" className="nd-edit" onClick={() => setStep(0)}>Change</button></div>
                <div><dt>Title</dt><dd>{form.title}</dd><button type="button" className="nd-edit" onClick={() => setStep(1)}>Change</button></div>
                <div><dt>Coverage</dt><dd>{DETAIL.find((d) => d.id === form.detail)!.name}, {DETAIL.find((d) => d.id === form.detail)!.slides.toLowerCase()}</dd><button type="button" className="nd-edit" onClick={() => setStep(1)}>Change</button></div>
                <div><dt>Colour mode</dt><dd>{form.theme === "dark" ? "Dark" : "Light"}</dd><button type="button" className="nd-edit" onClick={() => setStep(1)}>Change</button></div>
                <div><dt>Extras</dt><dd>{extras ? [form.audience && `for ${form.audience}`, form.language !== "English" && `in ${form.language}`, form.focus && "focus areas", form.exclude && "things to leave out", form.details && "notes", (form.presenter || form.organization || form.date) && "cover details"].filter(Boolean).join(", ") : "None"}</dd><button type="button" className="nd-edit" onClick={() => setStep(2)}>Change</button></div>
              </dl>
              <div role="radiogroup" aria-labelledby="nd-asst" className="nd-stack">
                <span id="nd-asst" className="nd-q">Build with</span>
                <div className="nd-tabs">
                  {ASSISTANTS.map((a) => (
                    <button key={a.id} type="button" role="radio" aria-checked={assistant === a.id} className={assistant === a.id ? "on" : ""} onClick={() => setAssistant(a.id)}>
                      {a.name}{!connected.includes(a.id) && <span className="muted"> (not connected)</span>}
                    </button>
                  ))}
                </div>
              </div>
              {!connected.includes(assistant) && <p className="small bad-text">{assistant === "chatgpt" ? "ChatGPT" : "Claude"} isn&apos;t connected yet. <Link href="/dashboard/setup">Connect it on the setup page</Link> first.</p>}
              <p className="small muted">{assistant === "chatgpt"
                ? "A new ChatGPT chat opens with your request. Choose your most capable model, make sure the Animated Technical Interactive plugin is on, and approve its actions when asked."
                : "A new claude.ai chat opens with your request typed in. Pick Opus or Sonnet there and press send; if it asks to use the connector, choose Always allow."}</p>
            </>
          )}
        </div>

        <div className="nd-foot">
          {step > 0 ? <button className="btn ghost" type="button" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          {step < 3
            ? <button className="btn primary" type="button" disabled={!canGo[step]} onClick={() => setStep(step + 1)}>{step === 2 && !extras ? "Skip" : "Continue"}</button>
            : <button className="btn primary lg" type="button" disabled={Boolean(busy)} onClick={submit}>{busy ?? `Open in ${assistant === "chatgpt" ? "ChatGPT" : "Claude"}`}</button>}
        </div>
      </div>

      <Cover form={form} source={source} />
    </section>
  );
}

/** The deck's first slide as it will look, updated while the form is filled in. */
function Cover({ form, source }: { form: Form; source: string }) {
  const byline = [form.presenter && `Presented by ${form.presenter}`, form.organization, fmtDate(form.date)].filter(Boolean).join("  ·  ");
  const d = DETAIL.find((x) => x.id === form.detail)!;
  return (
    <aside className="nd-cover" aria-label="Cover slide preview">
      <div className={`nd-slide ${form.theme}`}>
        <span className="nd-slide-src">{source || "your repository"}</span>
        <p className={`nd-slide-title ${form.title ? "" : "ph"}`}>{form.title || "Your presentation title"}</p>
        {byline && <p className="nd-slide-by">{byline}</p>}
        <span className="nd-slide-btn">Start</span>
      </div>
      <p className="nd-cover-cap"><Bars level={DETAIL.indexOf(d) + 1} /> {d.name}: {d.slides.toLowerCase()}{form.language !== "English" ? `, in ${form.language}` : ""}</p>
    </aside>
  );
}

/** Three bars, filled up to the coverage level. */
function Bars({ level }: { level: number }) {
  return <span className="nd-bars" aria-hidden>{[1, 2, 3].map((i) => <i key={i} className={i <= level ? "on" : ""} />)}</span>;
}

function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {})}>
      {done ? "Copied" : "Copy prompt"}
    </button>
  );
}
