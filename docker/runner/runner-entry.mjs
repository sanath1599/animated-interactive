// Runs the Claude Agent SDK against the workspace and emits JSONL events on stdout.
// Reads decisions for user-approval requests as JSONL on stdin.
import fs from "node:fs";
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { decideTool, describeTool } from "./policy.mjs";

const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const env = (k, d = "") => process.env[k] ?? d;

const cwd = env("DS_REPO_DIR");
const ctx = {
  cwd,
  readRoots: [cwd, env("DS_INPUT_DIR")].filter(Boolean),
  writeRoots: [env("DS_OUTPUT_DIR"), env("DS_SCREENSHOTS_DIR"), env("DS_REPORTS_DIR"), "/tmp"].filter(Boolean),
  chromePath: env("CHROME_PATH"),
};
const prompt = fs.readFileSync(env("DS_PROMPT_FILE"), "utf8");
const abort = new AbortController();
process.on("SIGTERM", () => abort.abort());

const pending = new Map();
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  try {
    const m = JSON.parse(line);
    if (m.type === "permission_response" && pending.has(m.requestId)) {
      pending.get(m.requestId)(Boolean(m.allow));
      pending.delete(m.requestId);
    }
  } catch { /* ignore malformed control lines */ }
});

const askUser = (tool, summary) =>
  new Promise((resolve) => {
    const requestId = randomUUID();
    pending.set(requestId, resolve);
    emit({ kind: "permission", requestId, tool, summary });
    setTimeout(() => { if (pending.delete(requestId)) resolve(false); }, 120_000); // no answer = deny
  });

// Minimal environment for the agent process: no host secrets leak into tool subprocesses.
const agentEnv = {
  PATH: env("PATH"),
  HOME: env("HOME"),
  TMPDIR: env("TMPDIR", "/tmp"),
  // Needed by the CLI to locate OS credential storage (macOS Keychain) in local session mode.
  ...(env("USER") ? { USER: env("USER") } : {}),
  ...(env("LOGNAME") ? { LOGNAME: env("LOGNAME") } : {}),
  ...(env("SHELL") ? { SHELL: env("SHELL") } : {}),
  CHROME_PATH: env("CHROME_PATH"),
  ...(env("ANTHROPIC_API_KEY") ? { ANTHROPIC_API_KEY: env("ANTHROPIC_API_KEY") } : {}),
  ...(env("CLAUDE_CONFIG_DIR") ? { CLAUDE_CONFIG_DIR: env("CLAUDE_CONFIG_DIR") } : {}),
};

let ok = false;
let error;
try {
  emit({ kind: "started" });
  const q = query({
    prompt,
    options: {
      cwd,
      env: agentEnv,
      abortController: abort,
      settingSources: [], // never load settings/hooks/CLAUDE.md from the untrusted repository
      permissionMode: "default",
      allowedTools: [],
      disallowedTools: ["WebFetch", "WebSearch", "NotebookEdit", "Task", "Agent"],
      maxTurns: Number(env("DS_MAX_TURNS", "300")),
      ...(env("DS_MODEL") ? { model: env("DS_MODEL") } : {}),
      ...(env("CLAUDE_CODE_PATH") ? { pathToClaudeCodeExecutable: env("CLAUDE_CODE_PATH") } : {}),
      canUseTool: async (tool, input) => {
        const d = decideTool(tool, input, ctx);
        if (d.decision === "allow") return { behavior: "allow", updatedInput: input };
        if (d.decision === "ask") {
          const detail = tool === "Bash" ? String(input.command ?? "").slice(0, 300) : describeTool(tool, input);
          const allowed = await askUser(tool, `${detail}\n(${d.reason})`);
          return allowed ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: "The user declined this action." };
        }
        emit({ kind: "denied", tool, reason: d.reason });
        return { behavior: "deny", message: d.reason ?? "Not permitted" };
      },
    },
  });
  for await (const msg of q) {
    if (msg.type === "assistant") {
      for (const b of msg.message?.content ?? []) {
        if (b.type === "tool_use") emit({ kind: "tool", tool: b.name, text: describeTool(b.name, b.input ?? {}), target: b.input?.file_path ?? b.input?.command ?? "" });
        else if (b.type === "text" && b.text?.trim()) emit({ kind: "text", text: b.text.trim().slice(0, 400) });
      }
    } else if (msg.type === "result") {
      ok = msg.subtype === "success" && !msg.is_error;
      if (!ok) error = msg.subtype === "success" ? "The agent reported an error" : `Run ended: ${msg.subtype}`;
      emit({ kind: "result", ok, turns: msg.num_turns, costUsd: msg.total_cost_usd, summary: ok ? String(msg.result ?? "").slice(0, 1500) : undefined });
    }
  }
} catch (e) {
  error = abort.signal.aborted ? "Cancelled" : (e instanceof Error ? e.message : String(e));
}
emit({ kind: "done", ok, error });
process.exit(ok ? 0 : 1);
