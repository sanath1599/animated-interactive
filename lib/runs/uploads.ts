import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { safeFilename } from "@/lib/security/ids";
import { validateUpload } from "@/lib/validation/schemas";
import { runSub } from "./paths";

export interface SavedUpload { name: string; path: string; bytes: number; isImage: boolean }

export async function saveUploads(runId: string, files: File[], pastedData: string): Promise<{ saved: SavedUpload[]; errors: string[] }> {
  const cfg = getConfig();
  const errors: string[] = [];
  const saved: SavedUpload[] = [];
  if (files.length > cfg.maxUploadFiles) return { saved, errors: [`At most ${cfg.maxUploadFiles} files are allowed`] };
  const used = new Set<string>();
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const v = validateUpload(f.name, buf, cfg.maxUploadBytes);
    if (!v.ok) { errors.push(v.error); continue; }
    let name = safeFilename(f.name);
    for (let i = 1; used.has(name); i++) name = `${path.parse(safeFilename(f.name)).name}-${i}.${v.ext}`;
    used.add(name);
    const dest = runSub(runId, "input", name);
    fs.writeFileSync(dest, buf, { mode: 0o600 });
    saved.push({ name, path: dest, bytes: buf.length, isImage: ["png", "jpg", "jpeg", "webp", "gif"].includes(v.ext) });
  }
  if (pastedData.trim()) {
    const dest = runSub(runId, "input", "pasted-data.txt");
    fs.writeFileSync(dest, pastedData, { mode: 0o600 }); // stored verbatim: values are never normalised
    saved.push({ name: "pasted-data.txt", path: dest, bytes: Buffer.byteLength(pastedData), isImage: false });
  }
  return { saved, errors };
}
