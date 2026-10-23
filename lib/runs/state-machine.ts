import type { RunStatus } from "@/types/run";

const NEXT: Record<RunStatus, RunStatus[]> = {
  queued: ["running", "cancelled", "failed", "interrupted"],
  running: ["succeeded", "failed", "cancelled", "interrupted"],
  succeeded: [],
  failed: [],
  cancelled: [],
  interrupted: [],
};

export const isTerminal = (s: RunStatus) => NEXT[s].length === 0;
export const canTransition = (from: RunStatus, to: RunStatus) => NEXT[from].includes(to);
