import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getConfig } from "@/lib/config";

export interface RunPaths { repo: string; input: string; output: string; screenshots: string; reports: string; prompt: string }
export interface LaunchOptions {
  runId: string;
  /** Host-side directories for the run. */
  host: RunPaths & { claudeConfig: string };
  /** Paths as the agent sees them (container paths in docker mode). */
  agent: RunPaths;
}

export function dockerArgs(o: LaunchOptions, cfg = getConfig()): string[] {
  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;
  const mount = (h: string, c: string, mode: "ro" | "rw") => ["-v", `${h}:${c}:${mode}`];
  return [
    "run", "--rm", "-i",
    "--name", `ds-${o.runId}`,
    "--label", "demo-studio=1", "--label", `demo-studio.run=${o.runId}`,
    "--user", `${uid}:${gid}`,
    "--read-only",
    "--tmpfs", "/tmp:rw,exec,nosuid,size=1g",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", "512",
    "--memory", "3g",
    "--cpus", "2",
    ...(process.env.RUNNER_NETWORK ? ["--network", process.env.RUNNER_NETWORK] : []),
    ...mount(o.host.repo, o.agent.repo, "rw"),
    ...mount(o.host.input, o.agent.input, "ro"),
    ...mount(o.host.output, o.agent.output, "rw"),
    ...mount(o.host.screenshots, o.agent.screenshots, "rw"),
    ...mount(o.host.reports, o.agent.reports, "rw"),
    ...mount(o.host.prompt, o.agent.prompt, "ro"),
    ...mount(o.host.claudeConfig, "/home/runner/.claude", "rw"),
    "-e", "HOME=/home/runner",
    "-e", "CLAUDE_CONFIG_DIR=/home/runner/.claude",
    "-e", `DS_REPO_DIR=${o.agent.repo}`,
    "-e", `DS_INPUT_DIR=${o.agent.input}`,
    "-e", `DS_OUTPUT_DIR=${o.agent.output}`,
    "-e", `DS_SCREENSHOTS_DIR=${o.agent.screenshots}`,
    "-e", `DS_REPORTS_DIR=${o.agent.reports}`,
    "-e", `DS_PROMPT_FILE=${o.agent.prompt}`,
    "-e", "CHROME_PATH=/usr/bin/chromium",
    ...(cfg.claudeAuthMode === "api_key" ? ["-e", "ANTHROPIC_API_KEY"] : []), // value is inherited from our env, never in argv
    cfg.runnerImage,
  ];
}

export type Runner = {
  child: ChildProcessByStdio<Writable, Readable, Readable>;
  kill: () => void;
};

/** Chrome/Chromium binary used for browser verification in local (non-Docker) mode, or "" if none is found. */
export function resolveChromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? "";
}

export function launchRunner(o: LaunchOptions): Runner {
  const cfg = getConfig();
  let child: Runner["child"];
  if (cfg.runnerMode === "docker") {
    const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...(cfg.claudeAuthMode === "api_key" ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "" } : {}) };
    child = spawn("docker", dockerArgs(o, cfg), { shell: false, stdio: ["pipe", "pipe", "pipe"], env: env as unknown as NodeJS.ProcessEnv });
  } else {
    if (cfg.runnerMode === "local" && process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_RUNNER !== "1") {
      throw new Error("RUNNER_MODE=local is not isolated and is disabled in production");
    }
    const script = cfg.runnerMode === "mock"
      ? (process.env.MOCK_RUNNER_SCRIPT ?? path.join(process.cwd(), "tests/fixtures/mock-runner.mjs"))
      : path.join(process.cwd(), "docker/runner/runner-entry.mjs");
    const chrome = resolveChromePath();
    child = spawn(process.execPath, [script], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: cfg.claudeAuthMode === "session" ? os.homedir() : o.host.claudeConfig,
        TMPDIR: os.tmpdir(),
        USER: process.env.USER ?? "",
        LOGNAME: process.env.LOGNAME ?? "",
        SHELL: process.env.SHELL ?? "",
        DS_REPO_DIR: o.agent.repo, DS_INPUT_DIR: o.agent.input, DS_OUTPUT_DIR: o.agent.output,
        DS_SCREENSHOTS_DIR: o.agent.screenshots, DS_REPORTS_DIR: o.agent.reports, DS_PROMPT_FILE: o.agent.prompt,
        CHROME_PATH: chrome,
        ...(process.env.CLAUDE_CODE_PATH ? { CLAUDE_CODE_PATH: process.env.CLAUDE_CODE_PATH } : {}),
        ...(process.env.DS_MODEL ? { DS_MODEL: process.env.DS_MODEL } : {}),
        ...(process.env.MOCK_SCENARIO ? { MOCK_SCENARIO: process.env.MOCK_SCENARIO } : {}),
        ...(cfg.claudeAuthMode === "api_key" ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "" } : {}),
      } as unknown as NodeJS.ProcessEnv,
    });
  }
  const kill = () => {
    if (cfg.runnerMode === "docker") {
      spawn("docker", ["kill", `ds-${o.runId}`], { shell: false, stdio: "ignore" }).on("error", () => {});
    }
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5000).unref();
  };
  return { child, kill };
}

/** Per-run copy of the owner's Claude Code credentials, so the shared config is never mounted writable. */
export function prepareClaudeConfig(dest: string): void {
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  const cfg = getConfig();
  if (cfg.claudeAuthMode !== "session") return;
  for (const f of [".credentials.json"]) {
    const src = path.join(cfg.claudeConfigDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, f));
  }
}
