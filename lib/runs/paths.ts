import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { isRunId, resolveInside } from "@/lib/security/ids";

export const SUBDIRS = ["input", "repo", "output", "screenshots", "reports"] as const;

export function runDir(runId: string): string {
  if (!isRunId(runId)) throw new Error("Invalid run id");
  return path.join(getConfig().dataDir, "runs", runId);
}

export function ensureRunDirs(runId: string): string {
  const dir = runDir(runId);
  for (const s of SUBDIRS) fs.mkdirSync(path.join(dir, s), { recursive: true, mode: 0o700 });
  return dir;
}

export function runSub(runId: string, sub: (typeof SUBDIRS)[number], ...rest: string[]): string {
  return resolveInside(runDir(runId), sub, ...rest);
}
