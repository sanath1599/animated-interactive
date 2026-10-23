import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { appendEvent, countActive, getRun, listRunsOlderThan, deleteRunRows, markOrphansInterrupted, transition } from "./store";
import { ensureRunDirs, runDir, runSub } from "./paths";
import { cloneRepo, sanitizeWorkspace } from "@/lib/github/clone";
import { getCloneToken } from "@/lib/github/client";
import { buildDemoPrompt } from "@/lib/prompts/build-demo-prompt";
import { launchRunner, prepareClaudeConfig, resolveChromePath, type Runner, type RunPaths } from "@/lib/claude/launch";
import { EventTranslator, isRunnerLine } from "@/lib/claude/translate";
import { JsonlParser } from "@/lib/claude/jsonl-parser";
import { runServerChecks } from "@/lib/artifacts/checks";
import { slugify } from "@/lib/security/ids";
import { redact } from "@/lib/security/redact";
import type { SavedUpload } from "./uploads";
import type { RunEvent } from "@/types/run";

interface Job { runId: string; details: string; uploads: SavedUpload[] }
interface Active { abort: AbortController; runner?: Runner; translator?: EventTranslator; cancelled: boolean; timedOut: boolean }

const g = globalThis as unknown as { __dsQueue?: Job[]; __dsActive?: Map<string, Active>; __dsBooted?: boolean };
const queue = (g.__dsQueue ??= []);
const active = (g.__dsActive ??= new Map<string, Active>());

/** Idempotent: reconcile runs orphaned by a previous process and start retention cleanup. */
export function bootstrap() {
  if (g.__dsBooted) return;
  g.__dsBooted = true;
  markOrphansInterrupted();
  if (getConfig().runnerMode === "docker") {
    // Containers from a previous process are labelled; remove stragglers.
    import("node:child_process").then(({ execFile }) =>
      execFile("docker", ["ps", "-aq", "--filter", "label=demo-studio=1"], (err, out) => {
        if (err || !out.trim()) return;
        execFile("docker", ["rm", "-f", ...out.trim().split("\n")], () => {});
      }),
    );
  }
  pruneOldRuns();
  setInterval(pruneOldRuns, 6 * 3600_000).unref();
}

export function pruneOldRuns() {
  const cutoff = Date.now() - getConfig().retentionDays * 86400_000;
  for (const r of listRunsOlderThan(cutoff)) {
    if (active.has(r.id)) continue;
    fs.rmSync(runDir(r.id), { recursive: true, force: true });
    deleteRunRows(r.id);
  }
}

export function enqueue(job: Job) {
  queue.push(job);
  pump();
}

function pump() {
  const max = getConfig().maxConcurrentRuns;
  while (active.size < max && queue.length) {
    const job = queue.shift()!;
    const a: Active = { abort: new AbortController(), cancelled: false, timedOut: false };
    active.set(job.runId, a);
    execute(job, a)
      .catch((e) => fail(job.runId, a, e))
      .finally(() => { active.delete(job.runId); pump(); });
  }
}

function fail(runId: string, a: Active, e: unknown) {
  const msg = a.cancelled ? "" : redact(e instanceof Error ? e.message : String(e));
  console.error(`[run ${runId}]`, msg || "cancelled");
  if (a.cancelled) transition(runId, "cancelled");
  else transition(runId, "failed", msg || "Unexpected error");
}

export function cancelRun(runId: string): boolean {
  const a = active.get(runId);
  const qi = queue.findIndex((j) => j.runId === runId);
  if (qi >= 0) { queue.splice(qi, 1); transition(runId, "cancelled"); return true; }
  if (!a) return false;
  a.cancelled = true;
  a.abort.abort();
  a.runner?.kill();
  return true;
}

export function respondToPermission(runId: string, requestId: string, allow: boolean): boolean {
  const a = active.get(runId);
  if (!a?.runner || !a.translator?.resolvePermission(requestId)) return false;
  a.runner.child.stdin.write(JSON.stringify({ type: "permission_response", requestId, allow }) + "\n");
  appendEvent(runId, { type: "permission_resolved", requestId, allowed: allow });
  return true;
}

const log = (runId: string, message: string, level: "info" | "warn" | "error" = "info") =>
  appendEvent(runId, { type: "log", level, message });

async function execute(job: Job, a: Active) {
  const cfg = getConfig();
  const { runId } = job;
  const run = getRun(runId);
  if (!run || !transition(runId, "running")) return;
  const dir = ensureRunDirs(runId);

  appendEvent(runId, { type: "stage", stage: "connecting" });
  log(runId, `Connecting to ${run.owner}/${run.repo}`);
  const token = await getCloneToken(run.repo, run.installationId);

  appendEvent(runId, { type: "stage", stage: "fetching" });
  log(runId, `Fetching branch ${run.branch}`);
  const repoDir = runSub(runId, "repo");
  fs.rmSync(repoDir, { recursive: true, force: true });
  await cloneRepo({ owner: run.owner, repo: run.repo, branch: run.branch, token, dest: repoDir, signal: a.abort.signal });
  const removed = sanitizeWorkspace(repoDir);
  log(runId, `Source fetched. ${removed.length} secret-like or unsafe file(s) were excluded from analysis.`);
  if (a.cancelled) throw new Error("cancelled");

  // Paths: container paths in docker mode, real host paths otherwise.
  const host: RunPaths & { claudeConfig: string } = {
    repo: repoDir, input: runSub(runId, "input"), output: runSub(runId, "output"),
    screenshots: runSub(runId, "screenshots"), reports: runSub(runId, "reports"),
    prompt: path.join(dir, "prompt.md"), claudeConfig: path.join(dir, "claude-config"),
  };
  const docker = cfg.runnerMode === "docker";
  const agent: RunPaths = docker
    ? { repo: "/work/repo", input: "/work/input", output: "/work/output", screenshots: "/work/screenshots", reports: "/work/reports", prompt: "/work/prompt.md" }
    : host;
  const slug = slugify(run.title);
  const mapUpload = (u: SavedUpload) => ({ path: path.join(agent.input, u.name), isImage: u.isImage });

  const prompt = buildDemoPrompt({
    title: run.title,
    repositoryWorkspace: agent.repo,
    outputHtmlPath: path.join(agent.output, `${slug}.html`),
    screenshotsDir: agent.screenshots,
    verificationReportPath: path.join(agent.reports, "verification-report.md"),
    evidenceReportPath: path.join(agent.reports, "evidence-report.md"),
    sampleFiles: job.uploads.map(mapUpload),
    additionalDetails: job.details,
    repoLabel: `${run.owner}/${run.repo}`,
    branch: run.branch,
    environmentNotes: docker
      ? "Headless Chromium is at /usr/bin/chromium; run it with --headless --no-sandbox --disable-gpu. Use --screenshot=<file> --window-size=W,H and file:// URLs."
      : resolveChromePath()
        ? `Headless Chrome is installed at "${resolveChromePath()}". Use exactly that path, quoted, and do not search for other browsers. Run it as: "${resolveChromePath()}" --headless --disable-gpu --screenshot=<file in the screenshots folder> --window-size=W,H file:///<path to the html>. Shell commands are limited to simple read-only commands (ls, cat, grep, find, head, wc, sed -n) and headless Chrome; commands that write, redirect, or run code require approval.`
        : "No Chrome binary was found; report browser verification as NOT RUN.",
  });
  fs.writeFileSync(host.prompt, prompt, { mode: 0o600 });
  prepareClaudeConfig(host.claudeConfig);

  // The agent may spell a path via a symlink (macOS /tmp -> /private/tmp); recognise both.
  const spell = (agentPath: string, hostPath: string) => [...new Set([agentPath, hostPath, fs.realpathSync(hostPath)])];
  const translator = new EventTranslator({ output: spell(agent.output, host.output), screenshots: spell(agent.screenshots, host.screenshots), reports: spell(agent.reports, host.reports) });
  a.translator = translator;
  const runner = launchRunner({ runId, host, agent });
  a.runner = runner;
  const timer = setTimeout(() => { a.timedOut = true; runner.kill(); }, cfg.runTimeoutMs);

  const parser = new JsonlParser();
  let stderrTail = "";
  let doneLine: { ok: boolean; error?: string } | null = null;
  const onLines = (items: unknown[]) => {
    for (const it of items) {
      if (!isRunnerLine(it)) continue;
      if (it.kind === "done") { doneLine = { ok: it.ok, error: it.error }; continue; }
      for (const ev of translator.handle(it)) appendEvent(runId, ev as RunEvent);
    }
  };
  runner.child.stdout.on("data", (d) => onLines(parser.push(d)));
  runner.child.stderr.on("data", (d) => { stderrTail = (stderrTail + d).slice(-4000); });

  const exitCode: number | null = await new Promise((resolve, reject) => {
    runner.child.on("error", reject);
    runner.child.on("close", (c) => resolve(c));
  });
  clearTimeout(timer);
  onLines(parser.flush());
  fs.rmSync(host.claudeConfig, { recursive: true, force: true });
  fs.rmSync(repoDir, { recursive: true, force: true }); // working copy is not needed once generation ends
  if (stderrTail.trim()) console.error(`[run ${runId}] runner stderr:`, redact(stderrTail.trim()));

  if (a.cancelled) throw new Error("cancelled");
  appendEvent(runId, { type: "stage", stage: "packaging" });
  const checks = runServerChecks(runId);
  log(runId, checks.htmlExists ? `Presentation saved (${Math.round(checks.htmlBytes / 1024)} KB)` : "No presentation file was produced", checks.htmlExists ? "info" : "error");
  if (checks.externalReferences.length) log(runId, `The file references ${checks.externalReferences.length} external resource(s); see the caveats.`, "warn");

  const ok = exitCode === 0 && checks.htmlExists && (doneLine as { ok: boolean } | null)?.ok !== false;
  if (ok) {
    appendEvent(runId, { type: "stage", stage: "ready" });
    transition(runId, "succeeded");
  } else {
    const why = a.timedOut ? "The run exceeded the time limit."
      : (doneLine as { error?: string } | null)?.error ?? (exitCode !== 0 ? `The generator exited unexpectedly (code ${exitCode}).` : "No presentation file was produced.");
    transition(runId, "failed", `${redact(String(why))}${checks.htmlExists ? " A partial result may be available." : ""}`);
  }
}

export { countActive };
