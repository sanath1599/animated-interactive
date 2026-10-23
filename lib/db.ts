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
