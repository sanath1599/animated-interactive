import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";

/**
 * Build history and usage analytics for the claude.ai artifact. Claude runs on the viewer's own plan,
 * so the page reports what it sent and received; token counts are estimates from those sizes.
 */

export const GENERATION_KINDS = ["build", "resume", "revise"] as const;
export const GENERATION_STATUSES = ["running", "completed", "failed", "stopped"] as const;
export type GenerationKind = (typeof GENERATION_KINDS)[number];
export type GenerationStatus = (typeof GENERATION_STATUSES)[number] | "interrupted";

/** A running build that has not reported for this long is shown as interrupted (the tab was closed). */
export const STALE_MS = 20 * 60_000;
/** Rough token estimates: ~4 characters per token, ~1,300 tokens per 1280×720 image. */
export const CHARS_PER_TOKEN = 4;
export const TOKENS_PER_IMAGE = 1300;
const estIn = (bytes: number, images: number) => Math.round(bytes / CHARS_PER_TOKEN + images * TOKENS_PER_IMAGE);
const estOut = (chars: number) => Math.round(chars / CHARS_PER_TOKEN);

const GEN_RE = /^gen_[a-f0-9]{24}$/;
export const isGenerationId = (v: unknown): v is string => typeof v === "string" && GEN_RE.test(v);

export interface Generation {
  id: string; kind: GenerationKind; status: GenerationStatus; phase: string | null;
  title: string; label: string; branch: string | null; workspaceId: string | null; deckId: string | null; deckAvailable: boolean;
  viewsChecked: number | null; viewsWithProblems: number | null; error: string | null;
  startedAt: number; updatedAt: number; finishedAt: number | null;
  claudeCalls: number; failedCalls: number; claudeMs: number; images: number; estInputTokens: number; estOutputTokens: number;
}

export interface GenerationInput {
  generationId?: string; kind?: GenerationKind; status: (typeof GENERATION_STATUSES)[number]; phase?: string;
  title?: string; label?: string; branch?: string | null; workspaceId?: string; deckId?: string; error?: string;
  viewsChecked?: number; viewsWithProblems?: number;
}

const clip = (v: string | null | undefined, n: number) => (v == null ? null : v.replace(/[\r\n]+/g, " ").trim().slice(0, n));

/** Creates a generation (no id) or updates one the user owns. Returns its id. */
export function recordGeneration(userId: number, g: GenerationInput): string {
  const db = getDb();
  const now = Date.now();
  const finished = g.status === "running" ? null : now;
  if (g.generationId) {
    const row = db.prepare("SELECT id FROM generations WHERE id=? AND user_id=?").get(g.generationId, userId);
    if (!row) throw new Error("Generation not found.");
    db.prepare(`UPDATE generations SET status=?, phase=COALESCE(?,phase), title=COALESCE(?,title), deck_id=COALESCE(?,deck_id),
      workspace_id=COALESCE(?,workspace_id), views_checked=COALESCE(?,views_checked), views_with_problems=COALESCE(?,views_with_problems),
      error=?, updated_at=?, finished_at=? WHERE id=?`)
      .run(g.status, clip(g.phase, 40), clip(g.title, 120), g.deckId ?? null, g.workspaceId ?? null, g.viewsChecked ?? null, g.viewsWithProblems ?? null,
        g.status === "running" ? null : clip(g.error, 500), now, finished, g.generationId);
    return g.generationId;
  }
  const id = `gen_${randomBytes(12).toString("hex")}`;
  db.prepare(`INSERT INTO generations(id,user_id,kind,status,phase,title,label,branch,workspace_id,deck_id,views_checked,views_with_problems,error,started_at,updated_at,finished_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, userId, g.kind ?? "build", g.status, clip(g.phase, 40), clip(g.title, 120) || "Untitled demo", clip(g.label, 120) ?? "", clip(g.branch, 200),
      g.workspaceId ?? null, g.deckId ?? null, g.viewsChecked ?? null, g.viewsWithProblems ?? null, clip(g.error, 500), now, now, finished);
  return id;
}

export interface ClaudeCallInput {
  callId: string; stage: string; tier: string; promptBytes: number; outputChars: number; images: number; ms: number; ok: boolean; errorCode?: string; ts?: number;
}

/** Records Claude calls for a generation. Re-sent calls (same callId) are ignored. Returns how many were new. */
export function recordClaudeCalls(userId: number, generationId: string, calls: ClaudeCallInput[]): number {
  const db = getDb();
  if (!db.prepare("SELECT id FROM generations WHERE id=? AND user_id=?").get(generationId, userId)) throw new Error("Generation not found.");
  const now = Date.now();
  const ins = db.prepare(`INSERT OR IGNORE INTO claude_calls(generation_id,call_id,user_id,ts,stage,tier,prompt_bytes,output_chars,images,ms,ok,error_code)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  let added = 0;
  db.transaction(() => {
    for (const c of calls) {
      // Clamp the client clock to the last day so a skewed clock can't rewrite history.
      const ts = c.ts && c.ts <= now && c.ts > now - 86_400_000 ? c.ts : now;
      added += ins.run(generationId, c.callId, userId, ts, clip(c.stage, 80) ?? "", clip(c.tier, 20) ?? "", c.promptBytes, c.outputChars, c.images, c.ms, c.ok ? 1 : 0, clip(c.errorCode, 40)).changes;
    }
    db.prepare("UPDATE generations SET updated_at=? WHERE id=?").run(now, generationId);
  })();
  return added;
}

const TOOL_RETENTION_MS = 180 * 86_400_000;
export function recordToolCall(userId: number, tool: string, ms: number, ok: boolean): void {
  const db = getDb();
  db.prepare("INSERT INTO tool_calls(user_id,tool,ts,ms,ok) VALUES(?,?,?,?,?)").run(userId, tool, Date.now(), Math.round(ms), ok ? 1 : 0);
  if (Math.random() < 0.01) db.prepare("DELETE FROM tool_calls WHERE ts<?").run(Date.now() - TOOL_RETENTION_MS);
}

type Row = Record<string, unknown>;
const GEN_SELECT = `SELECT g.*, (SELECT COUNT(*) FROM decks d WHERE d.id=g.deck_id AND d.bytes>0) deck_ok,
  COUNT(c.id) calls, COALESCE(SUM(1-c.ok),0) failed, COALESCE(SUM(c.ms),0) cms, COALESCE(SUM(c.images),0) imgs,
  COALESCE(SUM(c.prompt_bytes),0) pb, COALESCE(SUM(c.output_chars),0) oc
  FROM generations g LEFT JOIN claude_calls c ON c.generation_id=g.id`;

function effectiveStatus(status: string, updatedAt: number): GenerationStatus {
  return status === "running" && Date.now() - updatedAt > STALE_MS ? "interrupted" : (status as GenerationStatus);
}

const toGeneration = (r: Row): Generation => ({
  id: r.id as string, kind: r.kind as GenerationKind, status: effectiveStatus(r.status as string, r.updated_at as number), phase: (r.phase as string) ?? null,
  title: r.title as string, label: r.label as string, branch: (r.branch as string) ?? null, workspaceId: (r.workspace_id as string) ?? null,
  deckId: (r.deck_id as string) ?? null, deckAvailable: Boolean(r.deck_ok),
  viewsChecked: (r.views_checked as number) ?? null, viewsWithProblems: (r.views_with_problems as number) ?? null, error: (r.error as string) ?? null,
  startedAt: r.started_at as number, updatedAt: r.updated_at as number, finishedAt: (r.finished_at as number) ?? null,
  claudeCalls: r.calls as number, failedCalls: r.failed as number, claudeMs: r.cms as number, images: r.imgs as number,
  estInputTokens: estIn(r.pb as number, r.imgs as number), estOutputTokens: estOut(r.oc as number),
});

export function listGenerations(userId: number, limit = 50): Generation[] {
  return (getDb().prepare(`${GEN_SELECT} WHERE g.user_id=? GROUP BY g.id ORDER BY g.started_at DESC LIMIT ?`).all(userId, limit) as Row[]).map(toGeneration);
}

export interface UsageSummary {
  days: number;
  generations: { total: number; completed: number; failed: number; stopped: number; running: number; interrupted: number };
  claude: { calls: number; failedCalls: number; ms: number; images: number; estInputTokens: number; estOutputTokens: number };
  avgBuildMs: number | null;
  daily: { day: string; calls: number; estTokens: number; builds: number }[];
  stages: { stage: string; calls: number; estTokens: number; ms: number }[];
  tools: { tool: string; calls: number; failed: number }[];
  /** Admin view only: per-user totals. */
  users?: { login: string; builds: number; completed: number; calls: number; estTokens: number; lastActive: number }[];
}

/** Stage labels carry a screen title ("Rebuilding “Orders”"); group by the verb before it. */
const stageGroup = (s: string) => s.replace(/\s*[“"].*$/, "").replace(/\s+done.*$/, "").trim() || "Other";
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Usage over the last `days` days, for one user or (userId null) everyone. */
export function usageSummary(userId: number | null, days = 30): UsageSummary {
  const db = getDb();
  const since = Date.now() - days * 86_400_000;
  const who = userId === null ? "" : "AND user_id=?";
  const args = (...a: unknown[]) => (userId === null ? a : [...a, userId]);

  const gens = db.prepare(`SELECT status, updated_at, started_at, finished_at FROM generations WHERE started_at>=? ${who}`).all(...args(since)) as Row[];
  const g = { total: gens.length, completed: 0, failed: 0, stopped: 0, running: 0, interrupted: 0 };
  const durations: number[] = [];
  for (const r of gens) {
    const s = effectiveStatus(r.status as string, r.updated_at as number);
    g[s] += 1;
    if (s === "completed" && r.finished_at) durations.push((r.finished_at as number) - (r.started_at as number));
  }

  const calls = db.prepare(`SELECT ts, stage, ms, ok, images, prompt_bytes, output_chars FROM claude_calls WHERE ts>=? ${who}`).all(...args(since)) as Row[];
  const claude = { calls: calls.length, failedCalls: 0, ms: 0, images: 0, estInputTokens: 0, estOutputTokens: 0 };
  const byDay = new Map<string, { calls: number; estTokens: number; builds: number }>();
  for (let t = since; t <= Date.now(); t += 86_400_000) byDay.set(dayKey(t), { calls: 0, estTokens: 0, builds: 0 });
  byDay.set(dayKey(Date.now()), byDay.get(dayKey(Date.now())) ?? { calls: 0, estTokens: 0, builds: 0 });
  const byStage = new Map<string, { calls: number; estTokens: number; ms: number }>();
  for (const c of calls) {
    const tin = estIn(c.prompt_bytes as number, c.images as number), tout = estOut(c.output_chars as number);
    claude.failedCalls += c.ok ? 0 : 1; claude.ms += c.ms as number; claude.images += c.images as number;
    claude.estInputTokens += tin; claude.estOutputTokens += tout;
    const d = byDay.get(dayKey(c.ts as number)); if (d) { d.calls += 1; d.estTokens += tin + tout; }
    const k = stageGroup(c.stage as string);
    const s = byStage.get(k) ?? { calls: 0, estTokens: 0, ms: 0 };
    s.calls += 1; s.estTokens += tin + tout; s.ms += c.ms as number; byStage.set(k, s);
  }
  for (const r of gens) { const d = byDay.get(dayKey(r.started_at as number)); if (d) d.builds += 1; }

  const tools = (db.prepare(`SELECT tool, COUNT(*) calls, SUM(1-ok) failed FROM tool_calls WHERE ts>=? ${who} GROUP BY tool ORDER BY calls DESC`).all(...args(since)) as Row[])
    .map((r) => ({ tool: r.tool as string, calls: r.calls as number, failed: r.failed as number }));

  const out: UsageSummary = {
    days, generations: g, claude,
    avgBuildMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-days).map(([day, v]) => ({ day, ...v })),
    stages: [...byStage.entries()].map(([stage, v]) => ({ stage, ...v })).sort((a, b) => b.estTokens - a.estTokens),
    tools,
  };

  if (userId === null) {
    const rows = db.prepare(`SELECT u.login, u.id,
        (SELECT COUNT(*) FROM generations g WHERE g.user_id=u.id AND g.started_at>=?) builds,
        (SELECT COUNT(*) FROM generations g WHERE g.user_id=u.id AND g.started_at>=? AND g.status='completed') completed,
        (SELECT COUNT(*) FROM claude_calls c WHERE c.user_id=u.id AND c.ts>=?) calls,
        (SELECT COALESCE(SUM(c.prompt_bytes),0) FROM claude_calls c WHERE c.user_id=u.id AND c.ts>=?) pb,
        (SELECT COALESCE(SUM(c.output_chars),0) FROM claude_calls c WHERE c.user_id=u.id AND c.ts>=?) oc,
        (SELECT COALESCE(SUM(c.images),0) FROM claude_calls c WHERE c.user_id=u.id AND c.ts>=?) imgs,
        (SELECT MAX(t.ts) FROM tool_calls t WHERE t.user_id=u.id) last
      FROM users u`).all(since, since, since, since, since, since) as Row[];
    out.users = rows.filter((r) => (r.builds as number) > 0 || (r.calls as number) > 0 || r.last)
      .map((r) => ({ login: r.login as string, builds: r.builds as number, completed: r.completed as number, calls: r.calls as number,
        estTokens: estIn(r.pb as number, r.imgs as number) + estOut(r.oc as number), lastActive: (r.last as number) ?? 0 }))
      .sort((a, b) => b.lastActive - a.lastActive);
  }
  return out;
}

export interface ConnectorStatus { connected: boolean; connectedAt: number | null; lastUsedAt: number | null }

/** Whether claude.ai holds a live grant for this user (an unexpired, unrevoked refresh token), and when it last called. */
export function connectorStatus(userId: number, refreshTtlMs: number): ConnectorStatus {
  const db = getDb();
  const live = db.prepare("SELECT MAX(expires_at) exp FROM oauth_tokens WHERE user_id=? AND kind='refresh' AND revoked=0 AND expires_at>?").get(userId, Date.now()) as { exp: number | null };
  const last = db.prepare("SELECT MAX(ts) ts FROM tool_calls WHERE user_id=?").get(userId) as { ts: number | null };
  return { connected: live.exp !== null, connectedAt: live.exp !== null ? live.exp - refreshTtlMs : null, lastUsedAt: last.ts };
}
