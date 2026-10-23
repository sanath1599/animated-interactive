import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tempDataDir } from "./helpers";

vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => null }));

let store: typeof import("@/lib/runs/store");
let paths: typeof import("@/lib/runs/paths");
let registry: typeof import("@/lib/artifacts/registry");
let ids: typeof import("@/lib/security/ids");

beforeAll(async () => {
  tempDataDir();
  process.env.DEV_AUTH_BYPASS = "1"; // dev user id 1 for route handlers
  store = await import("@/lib/runs/store");
  paths = await import("@/lib/runs/paths");
  registry = await import("@/lib/artifacts/registry");
  ids = await import("@/lib/security/ids");
});
afterAll(() => { delete process.env.DEV_AUTH_BYPASS; });

const mk = (userId: number) => {
  const id = ids.newRunId();
  paths.ensureRunDirs(id);
  return store.createRun({ id, userId, title: "t", owner: "a", repo: "b", branch: "main", installationId: 1 });
};

describe("run store", () => {
  it("enforces legal status transitions and records events", () => {
    const r = mk(1);
    expect(store.transition(r.id, "running")).toBe(true);
    expect(store.transition(r.id, "queued" as never)).toBe(false);
    expect(store.transition(r.id, "succeeded")).toBe(true);
    expect(store.transition(r.id, "failed")).toBe(false);
    expect(store.getRun(r.id)?.status).toBe("succeeded");
    expect(store.eventsAfter(r.id).filter((e) => e.event.type === "status")).toHaveLength(2);
  });
  it("replays only events after a given id, in order", () => {
    const r = mk(1);
    const a = store.appendEvent(r.id, { type: "log", level: "info", message: "one" });
    store.appendEvent(r.id, { type: "log", level: "info", message: "two" });
    const after = store.eventsAfter(r.id, a.id);
    expect(after).toHaveLength(1);
    expect((after[0].event as { message: string }).message).toBe("two");
  });
  it("redacts secrets before persisting events", () => {
    const r = mk(1);
    store.appendEvent(r.id, { type: "log", level: "info", message: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" });
    expect(JSON.stringify(store.eventsAfter(r.id))).not.toContain("ghp_");
  });
  it("marks orphaned active runs as interrupted", () => {
    const r = mk(1);
    store.transition(r.id, "running");
    store.markOrphansInterrupted();
    const got = store.getRun(r.id)!;
    expect(got.status).toBe("interrupted");
    expect(got.error).toMatch(/restarted/);
  });
  it("hides other users' runs", () => {
    const r = mk(2);
    expect(store.getRunForUser(r.id, 2)).not.toBeNull();
    expect(store.getRunForUser(r.id, 1)).toBeNull();
  });
});

describe("artifact isolation", () => {
  it("serves only registered files, per run, and rejects traversal ids", () => {
    const a = mk(1), b = mk(1);
    fs.writeFileSync(path.join(paths.runDir(a.id), "output", "a.html"), "<p>a</p>");
    fs.writeFileSync(path.join(paths.runDir(a.id), "output", "notes.txt"), "no");
    fs.writeFileSync(path.join(paths.runDir(a.id), "input", "secret.csv"), "no");
    const list = registry.listArtifacts(a.id);
    expect(list.map((x) => x.name)).toEqual(["a.html"]);
    expect(registry.findArtifact(b.id, list[0].id)).toBeNull(); // another run cannot resolve it
    expect(registry.findArtifact(a.id, "../../etc/passwd")).toBeNull();
    expect(registry.findArtifact(a.id, list[0].id)?.name).toBe("a.html");
  });
  it("ignores symlinks planted in the output folder", () => {
    const a = mk(1);
    fs.symlinkSync("/etc/hosts", path.join(paths.runDir(a.id), "output", "evil.html"));
    expect(registry.listArtifacts(a.id)).toHaveLength(0);
  });
});

describe("HTTP route handlers", () => {
  it("artifact download returns 404 for another user's run and sandbox CSP for own HTML", async () => {
    const mine = mk(1), theirs = mk(2);
    for (const r of [mine, theirs]) fs.writeFileSync(path.join(paths.runDir(r.id), "output", "d.html"), "<p>x</p>");
    const route = await import("@/app/api/runs/[runId]/artifacts/[artifactId]/route");
    const id = registry.listArtifacts(mine.id)[0].id;
    const ok = await route.GET(new Request("http://x/"), { params: Promise.resolve({ runId: mine.id, artifactId: id }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-security-policy")).toMatch(/^sandbox /);
    const idTheirs = registry.listArtifacts(theirs.id)[0].id;
    const denied = await route.GET(new Request("http://x/"), { params: Promise.resolve({ runId: theirs.id, artifactId: idTheirs }) });
    expect(denied.status).toBe(404);
    const bad = await route.GET(new Request("http://x/"), { params: Promise.resolve({ runId: "../x", artifactId: id }) });
    expect(bad.status).toBe(404);
  });

  it("SSE replays missed events from Last-Event-ID and closes at a terminal status", async () => {
    const r = mk(1);
    store.transition(r.id, "running");
    const first = store.appendEvent(r.id, { type: "log", level: "info", message: "early" });
    store.appendEvent(r.id, { type: "log", level: "info", message: "missed" });
    store.transition(r.id, "succeeded");
    const route = await import("@/app/api/runs/[runId]/events/route");
    const res = await route.GET(new Request("http://x/", { headers: { "last-event-id": String(first.id) } }), { params: Promise.resolve({ runId: r.id }) });
    const text = await res.text();
    expect(text).toContain("missed");
    expect(text).not.toContain("early");
    expect(text).toContain("succeeded");
  });

  it("rejects cross-origin mutating requests", async () => {
    const r = mk(1);
    const route = await import("@/app/api/runs/[runId]/cancel/route");
    const res = await route.POST(new Request("http://x/", { method: "POST", headers: { origin: "https://evil.example" } }), { params: Promise.resolve({ runId: r.id }) });
    expect(res.status).toBe(403);
  });
});
