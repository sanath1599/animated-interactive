import os from "node:os";
import path from "node:path";

export type RunnerMode = "docker" | "local" | "mock";
export type ClaudeAuthMode = "session" | "api_key";

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export function getConfig() {
  const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
  return {
    appUrl,
    dataDir: process.env.DATA_DIR ?? path.join(os.homedir(), ".demo-studio"),
    sessionSecret: process.env.SESSION_SECRET ?? "",
    github: {
      appId: process.env.GITHUB_APP_ID ?? "",
      appSlug: process.env.GITHUB_APP_SLUG ?? "",
      clientId: process.env.GITHUB_APP_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET ?? "",
      privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    },
    runnerMode: (process.env.RUNNER_MODE ?? "docker") as RunnerMode,
    runnerImage: process.env.RUNNER_IMAGE ?? "demo-studio-runner:latest",
    claudeAuthMode: (process.env.CLAUDE_AUTH_MODE ?? "session") as ClaudeAuthMode,
    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"),
    maxConcurrentRuns: int("MAX_CONCURRENT_RUNS", 2),
    maxActiveRunsPerUser: int("MAX_ACTIVE_RUNS_PER_USER", 1),
    maxRunsPerUserPerDay: int("MAX_RUNS_PER_USER_PER_DAY", 10),
    runTimeoutMs: int("RUN_TIMEOUT_MINUTES", 60) * 60_000,
    retentionDays: int("RETENTION_DAYS", 14),
    maxUploadBytes: int("MAX_UPLOAD_MB", 10) * 1024 * 1024,
    maxUploadFiles: int("MAX_UPLOAD_FILES", 5),
    devAuthBypass: process.env.DEV_AUTH_BYPASS === "1" && process.env.NODE_ENV !== "production",
    /** Published claude.ai artifact that drives the Studio connector (the dashboard links to it). */
    artifactUrl: process.env.ARTIFACT_URL ?? "",
    /** GitHub logins that see usage across all users on /dashboard (comma separated). */
    adminLogins: (process.env.ADMIN_LOGINS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;

/** Display name the artifact looks the connector up by. It must match exactly. */
export const CONNECTOR_NAME = "Animated Technical Interactive";

export const mcpUrl = () => `${getConfig().appUrl}/api/mcp`;

/** claude.ai link that opens "Add custom connector" with the name and URL prefilled (the user still confirms). */
export const claudeInstallUrl = () =>
  `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(CONNECTOR_NAME)}&connectorUrl=${encodeURIComponent(mcpUrl())}`;

export const isAdmin = (login: string) => getConfig().adminLogins.includes(login.toLowerCase());
