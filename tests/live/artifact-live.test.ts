import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { tempDataDir } from "../helpers";
import { openBuilder, setupConnector, uploadAndConfigure, type SampleFn } from "../artifact-harness";

vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => null }));

/**
 * Opt-in quality run with REAL Claude standing in for the artifact's `sample` capability (via the Agent SDK and
 * the developer's Claude Code login, so it spends real usage). Builds a demo from a zipped repository:
 *   LIVE_REPO_ZIP=/path/repo.zip LIVE_TITLE="My App" [LIVE_DETAILS=file.txt] [LIVE_SAMPLES=a.png,b.png] [LIVE_OUT=dir]
 *   npx vitest run tests/live --testTimeout=0
 */
const ZIP = process.env.LIVE_REPO_ZIP ?? "";
const OUT = process.env.LIVE_OUT ?? path.join(os.tmpdir(), "artifact-live");
const MODELS: Record<string, string> = { complex: "opus", default: "sonnet", quick: "haiku" };

/** Same tolerant reading as sample.json: whole reply, else one fenced block, else first {…} / […]. */
function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { /* next */ }
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  if (fenced) try { return JSON.parse(fenced[1]); } catch { /* next */ }
  const a = text.search(/[[{]/), b = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw Object.assign(new Error("invalid_json"), { code: "invalid_json" });
}

const realSample = (log: (m: string) => void): SampleFn => async (prompt, opts) => {
  const model = MODELS[opts.modelTier ?? "default"] ?? "sonnet";
  const content: SDKUserMessage["message"]["content"] = [
    ...opts.images.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.type as "image/png", data: i.data } })),
    { type: "text" as const, text: prompt },
  ];
  async function* input(): AsyncGenerator<SDKUserMessage> { yield { type: "user", message: { role: "user", content }, parent_tool_use_id: null, session_id: "" }; }
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "live-sample-"));
  const t0 = Date.now();
  let text = "";
  for await (const m of query({ prompt: input(), options: { cwd, model, maxTurns: 1, settingSources: [], allowedTools: [], disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "Agent", "NotebookEdit", "TodoWrite"], canUseTool: async () => ({ behavior: "deny", message: "No tools" }) } })) {
    if (m.type === "result") { if (m.subtype !== "success") throw Object.assign(new Error(m.subtype), { code: "upstream_error" }); text = m.result; log(`${model} ${Math.round((Date.now() - t0) / 1000)}s $${m.total_cost_usd?.toFixed(2)} in=${prompt.length} out=${text.length}`); }
  }
  return parseJson(text);
};

let browser: Browser | null = null;
let client: Client;

beforeAll(async () => {
  if (!ZIP) return;
  tempDataDir();
  process.env.RUNNER_MODE = "local";
  client = await setupConnector(11, "live");
});
afterAll(async () => { await browser?.close(); });

describe.skipIf(!ZIP)("artifact builder with real Claude", () => {
  it("builds, verifies and reports a demo", async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const logFile = path.join(OUT, "live.log");
    const log = (m: string) => fs.appendFileSync(logFile, `[${new Date().toISOString().slice(11, 19)}] ${m}\n`);
    const chrome = (await import("@/lib/claude/launch")).resolveChromePath();
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, protocolTimeout: 0 });
    const h = await openBuilder(browser, client, realSample(log));
    const details = process.env.LIVE_DETAILS ? fs.readFileSync(process.env.LIVE_DETAILS, "utf8") : "";
    await uploadAndConfigure(h, ZIP, process.env.LIVE_TITLE ?? "Live demo", details, (process.env.LIVE_SAMPLES ?? "").split(",").filter(Boolean));
    await h.page.click("#go");
    const timer = setInterval(async () => {
      const t = await h.page.$eval("#main", (m) => (m.querySelector(".log li")?.textContent ?? "")).catch(() => "");
      if (t) log("ui: " + t);
    }, 30_000);
    try {
      await h.page.waitForFunction(() => document.getElementById("dl") || document.querySelector(".notice.bad"), { timeout: 0, polling: 2000 });
    } finally { clearInterval(timer); }
    const bad = await h.page.$eval(".notice.bad", (e) => e.textContent).catch(() => null);
    const reports = await h.page.$$eval("pre.report", (els) => els.map((e) => e.textContent ?? ""));
    const html = await h.page.$eval("#pv", (e) => (e as HTMLIFrameElement).srcdoc).catch(() => "");
    fs.writeFileSync(path.join(OUT, "deck.html"), html);
    reports.forEach((r, i) => fs.writeFileSync(path.join(OUT, i ? "evidence-report.md" : "verification-report.md"), r));
    fs.writeFileSync(path.join(OUT, "page-errors.txt"), h.errors.join("\n"));
    await h.page.screenshot({ path: path.join(OUT, "builder-result.png"), fullPage: true });
    log(`done: ${bad ?? "ok"}; ${h.prompts.length} Claude calls`);
    expect(bad).toBeNull();
    expect(html.length).toBeGreaterThan(10_000);
  });
});
