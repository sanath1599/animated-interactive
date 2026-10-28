import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";

const g = globalThis as unknown as { __dsDb?: Database.Database; __dsDbPath?: string };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, login TEXT NOT NULL, name TEXT, avatar_url TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, status TEXT NOT NULL, stage TEXT,
  title TEXT NOT NULL, owner TEXT NOT NULL, repo TEXT NOT NULL, branch TEXT NOT NULL,
  installation_id INTEGER NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER,
  finished_at INTEGER, error TEXT
);
CREATE INDEX IF NOT EXISTS runs_user ON runs(user_id, created_at);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, ts INTEGER NOT NULL, event TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_run ON events(run_id, id);

-- Studio connector (MCP) for the claude.ai artifact: OAuth 2.1 authorization server state.
CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, redirect_uris TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, user_id INTEGER NOT NULL, redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL, scope TEXT NOT NULL, resource TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, client_id TEXT NOT NULL, user_id INTEGER NOT NULL,
  scope TEXT NOT NULL, resource TEXT NOT NULL, family TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS oauth_tokens_family ON oauth_tokens(family);
-- GitHub user-to-server tokens, sealed, so connector calls can list the user's installations.
CREATE TABLE IF NOT EXISTS github_tokens (
  user_id INTEGER PRIMARY KEY, sealed TEXT NOT NULL, updated_at INTEGER NOT NULL
);
-- Read-only personal access tokens for Azure DevOps, GitLab and Bitbucket, sealed.
CREATE TABLE IF NOT EXISTS git_credentials (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, provider TEXT NOT NULL, host TEXT NOT NULL, label TEXT NOT NULL,
  username TEXT NOT NULL, sealed TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS git_credentials_user ON git_credentials(user_id);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, label TEXT NOT NULL, source TEXT NOT NULL, branch TEXT NOT NULL,
  status TEXT NOT NULL, error TEXT, file_count INTEGER NOT NULL DEFAULT 0, removed TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL, used_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS workspaces_user ON workspaces(user_id, created_at);
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, total INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, workspace_id TEXT NOT NULL, title TEXT NOT NULL, label TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0, state TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS decks_user ON decks(user_id, updated_at);
-- Usage history reported by the artifact: one row per build, resume or revision, and one per Claude call it made.
-- Claude runs on the viewer's plan, so sizes are measured in the page and tokens are only estimated from them.
CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, phase TEXT,
  title TEXT NOT NULL, label TEXT NOT NULL, branch TEXT, workspace_id TEXT, deck_id TEXT,
  views_checked INTEGER, views_with_problems INTEGER, error TEXT,
  started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS generations_user ON generations(user_id, started_at);
CREATE TABLE IF NOT EXISTS claude_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT, generation_id TEXT NOT NULL, call_id TEXT NOT NULL, user_id INTEGER NOT NULL, ts INTEGER NOT NULL,
  stage TEXT NOT NULL, tier TEXT NOT NULL, prompt_bytes INTEGER NOT NULL, output_chars INTEGER NOT NULL, images INTEGER NOT NULL,
  ms INTEGER NOT NULL, ok INTEGER NOT NULL, error_code TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS claude_calls_dedupe ON claude_calls(generation_id, call_id);
CREATE INDEX IF NOT EXISTS claude_calls_user ON claude_calls(user_id, ts);
-- Connector tool calls, for "last used" and server-side activity.
CREATE TABLE IF NOT EXISTS tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, tool TEXT NOT NULL, ts INTEGER NOT NULL, ms INTEGER NOT NULL, ok INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tool_calls_user ON tool_calls(user_id, ts);
-- Demo requests made on the dashboard and handed to a claude.ai chat: the generation they start and what was asked.
CREATE TABLE IF NOT EXISTS chat_requests (
  generation_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, config TEXT NOT NULL, created_at INTEGER NOT NULL
);
`;

export function getDb(): Database.Database {
  const dataDir = getConfig().dataDir;
  const file = path.join(dataDir, "demo-studio.db");
  if (g.__dsDb && g.__dsDbPath === file) return g.__dsDb;
  g.__dsDb?.close();
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  g.__dsDb = db;
  g.__dsDbPath = file;
  return db;
}
