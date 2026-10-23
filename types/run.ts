export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";

export const STAGES = [
  "connecting",
  "fetching",
  "inspecting",
  "briefing",
  "generating",
  "verifying",
  "packaging",
  "ready",
] as const;
export type StageId = (typeof STAGES)[number];

export const STAGE_LABELS: Record<StageId, string> = {
  connecting: "Connecting to the repository",
  fetching: "Fetching source code",
  inspecting: "Inspecting the application",
  briefing: "Preparing the presentation brief",
  generating: "Generating the HTML presentation",
  verifying: "Running browser verification",
  packaging: "Packaging the results",
  ready: "Ready to explore",
};

export type RunEvent =
  | { type: "stage"; stage: StageId }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "permission_request"; requestId: string; tool: string; summary: string }
  | { type: "permission_resolved"; requestId: string; allowed: boolean }
  | { type: "status"; status: RunStatus; error?: string };

export interface StoredEvent {
  id: number;
  runId: string;
  ts: number;
  event: RunEvent;
}

export interface RunRecord {
  id: string;
  userId: number;
  status: RunStatus;
  stage: StageId | null;
  title: string;
  owner: string;
  repo: string;
  branch: string;
  installationId: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
}
