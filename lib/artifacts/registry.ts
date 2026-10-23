import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { runDir } from "@/lib/runs/paths";
import { isArtifactId, resolveInside } from "@/lib/security/ids";
import type { ArtifactInfo, ArtifactKind } from "@/types/artifacts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8", ".json": "application/json",
};

interface Candidate { sub: string; kind: ArtifactKind; match: (n: string) => boolean }
const CANDIDATES: Candidate[] = [
  { sub: "output", kind: "html", match: (n) => n.endsWith(".html") },
  { sub: "screenshots", kind: "screenshot", match: (n) => /\.(png|jpe?g)$/.test(n) },
  { sub: "reports", kind: "verification-report", match: (n) => n === "verification-report.md" },
  { sub: "reports", kind: "evidence-report", match: (n) => n === "evidence-report.md" },
  { sub: "reports", kind: "verification-report", match: (n) => n === "server-checks.json" },
];

/** Artifact ids are derived from the relative path, so they are stable and carry no filesystem information. */
const idFor = (rel: string) => createHash("sha256").update(rel).digest("hex").slice(0, 16);

export interface RegisteredArtifact extends ArtifactInfo { abs: string }

export function listArtifacts(runId: string): RegisteredArtifact[] {
  const root = runDir(runId);
  const out: RegisteredArtifact[] = [];
  for (const c of CANDIDATES) {
    const dir = path.join(root, c.sub);
    if (!fs.existsSync(dir)) continue;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isFile() || ent.isSymbolicLink() || !c.match(ent.name)) continue;
      let abs: string;
      try { abs = resolveInside(root, c.sub, ent.name); } catch { continue; }
      const st = fs.statSync(abs);
      out.push({ id: idFor(`${c.sub}/${ent.name}`), kind: c.kind, name: ent.name, size: st.size, contentType: TYPES[path.extname(ent.name).toLowerCase()] ?? "application/octet-stream", abs });
    }
  }
  return out;
}

export function findArtifact(runId: string, artifactId: string): RegisteredArtifact | null {
  if (!isArtifactId(artifactId)) return null;
  return listArtifacts(runId).find((a) => a.id === artifactId) ?? null;
}

export function publicInfo(a: RegisteredArtifact): ArtifactInfo {
  const { abs: _abs, ...rest } = a;
  void _abs;
  return rest;
}
