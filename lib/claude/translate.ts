import type { RunEvent, StageId } from "@/types/run";
import { STAGES } from "@/types/run";
import { redact } from "@/lib/security/redact";

export type RunnerLine =
  | { kind: "started" }
  | { kind: "tool"; tool: string; text: string; target?: string }
  | { kind: "text"; text: string }
  | { kind: "denied"; tool: string; reason?: string }
  | { kind: "permission"; requestId: string; tool: string; summary: string }
  | { kind: "result"; ok: boolean; turns?: number; costUsd?: number; summary?: string }
  | { kind: "done"; ok: boolean; error?: string };

export const isRunnerLine = (v: unknown): v is RunnerLine =>
  typeof v === "object" && v !== null && typeof (v as { kind?: unknown }).kind === "string";

/** A real browser-verification command: a headless flag or a screenshot target, not just any mention of Chrome. */
const CHROME = /--headless|--screenshot=/i;

/** Converts structured runner events into user-facing events; stage advances only on real signals and never goes backwards. */
export class EventTranslator {
  private stage: StageId = "fetching";
  private pendingPermissions = new Set<string>();
  constructor(private dirs: { output: string | string[]; screenshots: string | string[]; reports: string | string[] }) {}

  /** Paths may be spelled via symlinks (macOS /tmp -> /private/tmp), so callers can pass every spelling. */
  private under(target: string, key: "output" | "screenshots" | "reports") {
    return [this.dirs[key]].flat().some((d) => target.startsWith(d));
  }

  private advance(to: StageId, out: RunEvent[]) {
    if (STAGES.indexOf(to) > STAGES.indexOf(this.stage)) {
      this.stage = to;
      out.push({ type: "stage", stage: to });
    }
  }

  handle(line: RunnerLine): RunEvent[] {
    const out: RunEvent[] = [];
    switch (line.kind) {
      case "started":
        out.push({ type: "log", level: "info", message: "Claude Code started in the isolated workspace" });
        break;
      case "tool": {
        const t = line.target ?? "";
        const writes = line.tool === "Write" || line.tool === "Edit" || line.tool === "MultiEdit";
        if (writes && this.under(t, "output")) this.advance("generating", out);
        else if ((writes && (this.under(t, "screenshots") || this.under(t, "reports"))) || (line.tool === "Bash" && CHROME.test(t))) this.advance("verifying", out);
        else if (["Read", "Glob", "Grep"].includes(line.tool)) this.advance("inspecting", out);
        else if (line.tool === "TodoWrite" && STAGES.indexOf(this.stage) >= STAGES.indexOf("inspecting")) this.advance("briefing", out);
        out.push({ type: "log", level: "info", message: line.text });
        break;
      }
      case "text":
        if (STAGES.indexOf(this.stage) === STAGES.indexOf("inspecting")) this.advance("briefing", out);
        out.push({ type: "log", level: "info", message: line.text });
        break;
      case "denied":
        out.push({ type: "log", level: "warn", message: `Blocked ${line.tool}: ${line.reason ?? "not permitted"}` });
        break;
      case "permission":
        this.pendingPermissions.add(line.requestId);
        out.push({ type: "permission_request", requestId: line.requestId, tool: line.tool, summary: line.summary });
        break;
      case "result":
        out.push({ type: "log", level: line.ok ? "info" : "error", message: line.ok ? `Claude finished (${line.turns ?? "?"} turns)` : "Claude ended without a successful result" });
        break;
      case "done":
        break;
    }
    return out.map((e) => (e.type === "log" ? { ...e, message: redact(e.message) } : e));
  }

  hasPendingPermission(id: string) { return this.pendingPermissions.has(id); }
  resolvePermission(id: string) { return this.pendingPermissions.delete(id); }
}
