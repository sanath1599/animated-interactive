"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Credential } from "./access-tokens";
import type { DailyUsage } from "./usage-chart";

export interface Connector { connected: boolean; connectedAt: number | null; lastUsedAt: number | null; name: string; mcpUrl: string; installUrl: string }
export type Status = "running" | "completed" | "failed" | "stopped" | "interrupted";
export interface Generation {
  id: string; kind: "build" | "resume" | "revise"; status: Status; phase: string | null; title: string; label: string; branch: string | null;
  deckId: string | null; deckAvailable: boolean; viewsChecked: number | null; viewsWithProblems: number | null; error: string | null;
  startedAt: number; updatedAt: number; finishedAt: number | null; chat: boolean; claudeUrl: string | null;
  claudeCalls: number; failedCalls: number; claudeMs: number; images: number; estInputTokens: number; estOutputTokens: number;
}
export interface Usage {
  days: number;
  generations: Record<"total" | "completed" | "failed" | "stopped" | "running" | "interrupted", number>;
  claude: { calls: number; failedCalls: number; ms: number; images: number; estInputTokens: number; estOutputTokens: number };
  avgBuildMs: number | null;
  daily: DailyUsage[];
  stages: { stage: string; calls: number; estTokens: number; ms: number }[];
  tools: { tool: string; calls: number; failed: number }[];
  users?: { login: string; builds: number; completed: number; calls: number; estTokens: number; lastActive: number }[];
}
export interface DashboardData {
  user: { login: string; name: string | null; avatarUrl: string | null; admin: boolean };
  github: { installations: number | null; installUrl: string | null };
  connector: Connector; artifactUrl: string | null; credentials: Credential[]; generations: Generation[]; usage: Usage; scope: "me" | "all";
}

export const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
export const dur = (ms: number) => { const m = Math.round(ms / 60000); return m < 1 ? `${Math.max(1, Math.round(ms / 1000))}s` : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; };

/**
 * Loads /api/dashboard and keeps it fresh: while the connector isn't linked it polls the cheap status
 * endpoint (the OAuth grant lands when the user clicks Allow), and while a build runs it reloads every 10 s.
 */
export function useDashboard({ days = 30, scope = "me" }: { days?: number; scope?: "me" | "all" } = {}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<DashboardData>(`/api/dashboard?days=${days}&scope=${scope}`)); setError(null); }
    catch (e) { if ((e as { status?: number }).status === 401) setSignedOut(true); else setError((e as Error).message); }
  }, [days, scope]);
  // Fetch on mount and when the range changes; state is set only after the request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const connected = data?.connector.connected ?? false;
  const running = data?.generations.some((x) => x.status === "running") ?? false;
  useEffect(() => {
    if (!data || connected) return;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const s = await api<{ connector: { connected: boolean } }>("/api/dashboard?status=1").catch(() => null);
      if (s?.connector.connected) await loadRef.current();
    }, 4000);
    return () => clearInterval(id);
  }, [data, connected]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") void loadRef.current(); }, 10_000);
    return () => clearInterval(id);
  }, [running]);

  return { data, signedOut, error, setError, load, connected };
}
