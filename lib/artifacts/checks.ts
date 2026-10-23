import fs from "node:fs";
import path from "node:path";
import { listArtifacts } from "./registry";
import { runSub } from "@/lib/runs/paths";

export interface ServerChecks {
  htmlExists: boolean;
  htmlFile: string | null;
  htmlBytes: number;
  underSizeTarget: boolean;
  externalReferences: string[];
  screenshotCount: number;
  verificationReportPresent: boolean;
  evidenceReportPresent: boolean;
  /** True only when every mandatory evidence item exists; does not assert the agent's checks passed. */
  fullyDocumented: boolean;
}

const EXTERNAL = /(?:src|href|action)\s*=\s*["']\s*(?:https?:)?\/\/[^"']+|url\(\s*["']?\s*(?:https?:)?\/\/[^)"']+|@import\s+(?:url\()?["']?\s*(?:https?:)?\/\/[^;"')]+/gi;

export function scanExternalRefs(html: string): string[] {
  const refs = new Set<string>();
  for (const m of html.matchAll(EXTERNAL)) {
    const v = m[0];
    // Plain <a href="https://..."> links are navigation, not resource loads.
    if (/^href/i.test(v) && !/rel\s*=\s*["']?stylesheet/i.test(html.slice(Math.max(0, (m.index ?? 0) - 80), m.index))) continue;
    refs.add(v.replace(/\s+/g, " ").slice(0, 120));
  }
  return [...refs].slice(0, 20);
}

export function runServerChecks(runId: string): ServerChecks {
  const arts = listArtifacts(runId);
  const html = arts.find((a) => a.kind === "html");
  const refs = html ? scanExternalRefs(fs.readFileSync(html.abs, "utf8")) : [];
  const shots = arts.filter((a) => a.kind === "screenshot").length;
  const vr = arts.some((a) => a.name === "verification-report.md");
  const er = arts.some((a) => a.name === "evidence-report.md");
  const checks: ServerChecks = {
    htmlExists: Boolean(html && html.size > 0),
    htmlFile: html?.name ?? null,
    htmlBytes: html?.size ?? 0,
    underSizeTarget: Boolean(html && html.size <= 150 * 1024),
    externalReferences: refs,
    screenshotCount: shots,
    verificationReportPresent: vr,
    evidenceReportPresent: er,
    fullyDocumented: Boolean(html && html.size > 0 && refs.length === 0 && shots > 0 && vr && er),
  };
  fs.writeFileSync(path.join(runSub(runId, "reports"), "server-checks.json"), JSON.stringify(checks, null, 2));
  return checks;
}
