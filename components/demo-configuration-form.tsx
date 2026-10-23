"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { SampleDataUpload, validateFiles } from "./sample-data-upload";
import type { Repo } from "@/types/github";
import type { RunRecord } from "@/types/run";

interface Props { repo: Repo; branch: string; onStarted: (run: RunRecord) => void; onBack: () => void }

export function DemoConfigurationForm({ repo, branch, onStarted, onBack }: Props) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [pasted, setPasted] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return; // prevents duplicate submissions
    setError(null);
    if (!title.trim()) { setTitleError("Presentation title is required."); return; }
    setTitleError(null);
    const fileError = validateFiles(files);
    if (fileError) { setError(fileError); return; }
    const fd = new FormData();
    fd.set("owner", repo.owner); fd.set("repo", repo.name); fd.set("branch", branch);
    fd.set("installationId", String(repo.installationId)); fd.set("title", title.trim());
    fd.set("details", details); fd.set("pastedData", pasted);
    files.forEach((f) => fd.append("files", f));
    setBusy(true);
    try {
      const { run } = await api<{ run: RunRecord }>("/api/runs", { method: "POST", body: fd });
      onStarted(run);
    } catch (err) {
      const ex = err as Error & { fields?: Record<string, string[]> };
      if (ex.fields?.title) setTitleError(ex.fields.title[0]);
      setError(ex.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack narrow" noValidate>
      <div><p className="eyebrow">Step 2 · Configure</p><h2>Shape your <em>demo</em></h2></div>
      <div>
        <label htmlFor="title">Presentation title <span className="muted">(required)</span></label>
        <input id="title" type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!titleError} aria-describedby="title-err" placeholder="e.g. Acme Analytics: Quarterly Results" />
        {titleError && <p id="title-err" className="field-error" role="alert">{titleError}</p>}
      </div>
      <div>
        <label htmlFor="details">Additional details <span className="muted">(optional)</span></label>
        <textarea id="details" value={details} maxLength={8000} onChange={(e) => setDetails(e.target.value)} placeholder="Audience, key features, pages to show, narrative, branding preferences…" />
        <p className="hint">Skip this and Claude will infer everything from the code. Default audience: non-technical executives.</p>
      </div>
      <SampleDataUpload files={files} pasted={pasted} onFiles={setFiles} onPasted={setPasted} />
      <div className="card">
        <p className="eyebrow">Run summary</p>
        <div className="small">
          <div><span className="muted">Repository</span> · <strong>{repo.fullName}</strong> <span className="chip">{repo.visibility}</span></div>
          <div><span className="muted">Branch</span> · <span className="mono">{branch}</span></div>
          <div><span className="muted">Audience</span> · non-technical executives</div>
          <div><span className="muted">Sample data</span> · {files.length || pasted.trim() ? `${files.length} file(s)${pasted.trim() ? " + pasted data" : ""}` : "none (Claude will use repository evidence)"}</div>
        </div>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      <div className="row">
        <button type="button" className="btn" onClick={onBack} disabled={busy}>Back</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Starting…" : "Generate demo"}</button>
      </div>
    </form>
  );
}
