// These tests drive the real job manager with a MOCK runner script. They prove orchestration,
// state handling, cancellation and packaging logic, not that real Claude Code execution works.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { tempDataDir } from "./helpers";

vi.mock("@/lib/github/clone", async (orig) => ({
  ...(await orig<object>()),
  cloneRepo: vi.fn(async ({ dest }: { dest: string }) => {
    const fs = await import("node:fs");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(`${dest}/package.json`, "{}");
    fs.writeFileSync(`${dest}/.env`, "SECRET=1");
  }),
}));
vi.mock("@/lib/github/client", () => ({ getCloneToken: vi.fn(async () => "tok") }));

let store: typeof import("@/lib/runs/store");
let mgr: typeof import("@/lib/runs/manager");
let paths: typeof import("@/lib/runs/paths");
let ids: typeof import("@/lib/security/ids");
let fs: typeof import("node:fs");

beforeAll(async () => {
  tempDataDir();
  process.env.RUNNER_MODE = "mock";
  process.env.CLAUDE_AUTH_MODE = "api_key";
  process.env.MAX_CONCURRENT_RUNS = "3";
  store = await import("@/lib/runs/store");
  mgr = await import("@/lib/runs/manager");
  paths = await import("@/lib/runs/paths");
  ids = await import("@/lib/security/ids");
  fs = await import("node:fs");
});

async function run(scenario: string, cancelAfterMs?: number) {
  process.env.MOCK_SCENARIO = scenario;
  const id = ids.newRunId();
  paths.ensureRunDirs(id);
  store.createRun({ id, userId: 1, title: "Mock Demo", owner: "a", repo: "b", branch: "main", installationId: 1 });
  mgr.enqueue({ runId: id, details: "", uploads: [] });
  if (cancelAfterMs !== undefined) setTimeout(() => mgr.cancelRun(id), cancelAfterMs);
  for (let i = 0; i < 200; i++) {
    const r = store.getRun(id)!;
    if (!["queued", "running"].includes(r.status)) return r;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("run did not finish");
}

const stagesOf = (id: string) => store.eventsAfter(id).filter((e) => e.event.type === "stage").map((e) => (e.event as { stage: string }).stage);

describe("job manager (mock runner)", () => {
  it("succeeds, advances stages in order, and packages artifacts", async () => {
    const r = await run("success");
    expect(r.status).toBe("succeeded");
    const st = stagesOf(r.id);
    expect(st[0]).toBe("connecting");
    expect(st).toEqual([...st].sort((a, b) => ["connecting","fetching","inspecting","briefing","generating","verifying","packaging","ready"].indexOf(a) - ["connecting","fetching","inspecting","briefing","generating","verifying","packaging","ready"].indexOf(b)));
    expect(st.at(-1)).toBe("ready");
    const checks = JSON.parse(fs.readFileSync(`${paths.runDir(r.id)}/reports/server-checks.json`, "utf8"));
    expect(checks.fullyDocumented).toBe(true);
    expect(fs.existsSync(`${paths.runDir(r.id)}/repo`)).toBe(false); // working copy removed
  });

  it("fails honestly when the runner fails and no file exists", async () => {
    const r = await run("fail");
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/mock failure/);
  });

  it("flags external resources and incomplete evidence", async () => {
    const r = await run("external");
    const checks = JSON.parse(fs.readFileSync(`${paths.runDir(r.id)}/reports/server-checks.json`, "utf8"));
    expect(checks.externalReferences.length).toBe(1);
    expect(checks.fullyDocumented).toBe(false);
  });

  it("keeps a partial result and does not claim full documentation", async () => {
    const r = await run("partial-fail");
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/partial result/i);
  });

  it("cancels a running job and ends in cancelled", async () => {
    const r = await run("hang", 800);
    expect(r.status).toBe("cancelled");
  });

  it("reports an unusable runner as a failure instead of hanging", async () => {
    process.env.MOCK_RUNNER_SCRIPT = "/nonexistent/mock.mjs";
    const r = await run("success");
    delete process.env.MOCK_RUNNER_SCRIPT;
    expect(r.status).toBe("failed");
  });
});
