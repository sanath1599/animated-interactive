"use client";
import { fmtBytes } from "@/lib/client";

export const UPLOAD_EXT = ["csv", "json", "txt", "md", "xlsx", "png", "jpg", "jpeg", "webp", "gif"];
export const MAX_MB = 10;
export const MAX_FILES = 5;

export function validateFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return `At most ${MAX_FILES} files.`;
  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!UPLOAD_EXT.includes(ext)) return `${f.name}: unsupported type. Allowed: ${UPLOAD_EXT.join(", ")}.`;
    if (f.size > MAX_MB * 1048576) return `${f.name}: larger than ${MAX_MB} MB.`;
    if (f.size === 0) return `${f.name}: file is empty.`;
  }
  return null;
}

interface Props { files: File[]; pasted: string; onFiles: (f: File[]) => void; onPasted: (v: string) => void }

export function SampleDataUpload({ files, pasted, onFiles, onPasted }: Props) {
  const error = validateFiles(files);
  return (
    <fieldset className="card" style={{ border: "1px solid hsl(var(--border))" }}>
      <legend className="eyebrow">Sample data · optional</legend>
      <label htmlFor="pasted">Paste a table or structured data</label>
      <textarea id="pasted" className="mono" value={pasted} onChange={(e) => onPasted(e.target.value)} placeholder={"Metric,Value\nAutomated runs,1240"} maxLength={100000} />
      <p className="hint">Values are passed to Claude exactly as written.</p>
      <label htmlFor="files" style={{ marginTop: "1rem" }}>Or upload files</label>
      <input id="files" type="file" multiple accept={UPLOAD_EXT.map((e) => `.${e}`).join(",")} onChange={(e) => onFiles(Array.from(e.target.files ?? []))} />
      <p className="hint">CSV, JSON, TXT, Markdown, XLSX, PNG/JPG/WebP/GIF. Up to {MAX_FILES} files, {MAX_MB} MB each.</p>
      {files.length > 0 && <ul className="small">{files.map((f) => <li key={f.name}>{f.name} <span className="muted">({fmtBytes(f.size)})</span></li>)}</ul>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </fieldset>
  );
}
