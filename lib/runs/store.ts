import { getDb } from "@/lib/db";
import { canTransition, isTerminal } from "./state-machine";
import type { RunEvent, RunRecord, RunStatus, StageId, StoredEvent } from "@/types/run";
import { redact } from "@/lib/security/redact";

type Row = Record<string, unknown>;
const toRun = (r: Row): RunRecord => ({
  id: r.id as string,
  userId: r.user_id as number,
  status: r.status as RunStatus,
  stage: (r.stage as StageId | null) ?? null,
  title: r.title as string,
  owner: r.owner as string,
  repo: r.repo as string,
  branch: r.branch as string,
  installationId: r.installation_id as number,
  createdAt: r.created_at as number,
  startedAt: (r.started_at as number | null) ?? null,
  finishedAt: (r.finished_at as number | null) ?? null,
  error: (r.error as string | null) ?? null,
});

type Listener = (e: StoredEvent) => void;
const g = globalThis as unknown as { __dsListeners?: Map<string, Set<Listener>> };
const listeners: Map<string, Set<Listener>> = (g.__dsListeners ??= new Map());

export function subscribe(runId: string, fn: Listener): () => void {
  let set = listeners.get(runId);
  if (!set) listeners.set(runId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(runId);
  };
}

export function upsertUser(u: { id: number; login: string; name: string | null; avatarUrl: string | null }) {
  getDb()
    .prepare(
      `INSERT INTO users(id, login, name, avatar_url, created_at) VALUES(?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET login=excluded.login, name=excluded.name, avatar_url=excluded.avatar_url`,
    )
    .run(u.id, u.login, u.name, u.avatarUrl, Date.now());
}

export function createRun(r: Omit<RunRecord, "status" | "stage" | "createdAt" | "startedAt" | "finishedAt" | "error">): RunRecord {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO runs(id,user_id,status,title,owner,repo,branch,installation_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(r.id, r.userId, "queued", r.title, r.owner, r.repo, r.branch, r.installationId, now);
  return getRun(r.id)!;
}

export function getRun(id: string): RunRecord | null {
  const row = getDb().prepare("SELECT * FROM runs WHERE id=?").get(id) as Row | undefined;
  return row ? toRun(row) : null;
}

/** Owner-scoped lookup: other users' runs are indistinguishable from missing ones. */
export function getRunForUser(id: string, userId: number): RunRecord | null {
  const run = getRun(id);
  return run && run.userId === userId ? run : null;
}

export function listRuns(userId: number, limit = 50): RunRecord[] {
  return (getDb().prepare("SELECT * FROM runs WHERE user_id=? ORDER BY created_at DESC LIMIT ?").all(userId, limit) as Row[]).map(toRun);
}

export function countRunsSince(userId: number, since: number): number {
  const r = getDb().prepare("SELECT COUNT(*) c FROM runs WHERE user_id=? AND created_at>=?").get(userId, since) as { c: number };
  return r.c;
}

export function countActive(userId?: number): number {
  const sql = "SELECT COUNT(*) c FROM runs WHERE status IN ('queued','running')" + (userId ? " AND user_id=?" : "");
  const r = (userId ? getDb().prepare(sql).get(userId) : getDb().prepare(sql).get()) as { c: number };
  return r.c;
}

export function appendEvent(runId: string, event: RunEvent): StoredEvent {
  const safe: RunEvent = event.type === "log" ? { ...event, message: redact(event.message) } : event;
  const ts = Date.now();
  const info = getDb().prepare("INSERT INTO events(run_id, ts, event) VALUES(?,?,?)").run(runId, ts, JSON.stringify(safe));
  if (safe.type === "stage") getDb().prepare("UPDATE runs SET stage=? WHERE id=?").run(safe.stage, runId);
  const stored: StoredEvent = { id: Number(info.lastInsertRowid), runId, ts, event: safe };
  listeners.get(runId)?.forEach((fn) => fn(stored));
  return stored;
}

export function eventsAfter(runId: string, afterId = 0): StoredEvent[] {
  return (getDb().prepare("SELECT * FROM events WHERE run_id=? AND id>? ORDER BY id").all(runId, afterId) as Row[]).map((r) => ({
    id: r.id as number,
    runId,
    ts: r.ts as number,
    event: JSON.parse(r.event as string) as RunEvent,
  }));
}

/** Apply a validated status transition. Returns false if the transition is illegal. */
export function transition(runId: string, to: RunStatus, error?: string): boolean {
  const run = getRun(runId);
  if (!run || !canTransition(run.status, to)) return false;
  const now = Date.now();
  getDb()
    .prepare("UPDATE runs SET status=?, started_at=COALESCE(started_at, ?), finished_at=?, error=? WHERE id=?")
    .run(to, to === "running" ? now : null, isTerminal(to) ? now : null, error ? redact(error) : null, runId);
  appendEvent(runId, { type: "status", status: to, ...(error ? { error: redact(error) } : {}) });
  return true;
}

/** Called at startup: anything still active belonged to a previous process. */
export function markOrphansInterrupted(): string[] {
  const rows = getDb().prepare("SELECT id FROM runs WHERE status IN ('queued','running')").all() as { id: string }[];
  for (const r of rows) transition(r.id, "interrupted", "The server restarted while this run was active.");
  return rows.map((r) => r.id);
}

export function listRunsOlderThan(ts: number): RunRecord[] {
  return (getDb().prepare("SELECT * FROM runs WHERE finished_at IS NOT NULL AND finished_at<? AND status NOT IN ('queued','running')").all(ts) as Row[]).map(toRun);
}

export function deleteRunRows(runId: string) {
  getDb().prepare("DELETE FROM events WHERE run_id=?").run(runId);
  getDb().prepare("DELETE FROM runs WHERE id=?").run(runId);
}
