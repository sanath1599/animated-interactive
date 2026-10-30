import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { scanExternalRefs } from "@/lib/artifacts/checks";
import { slugify } from "@/lib/security/ids";
import { getWorkspace, repoDir, studioDir } from "./workspaces";
import { inlineImages, type InlineReport } from "./images";

/** Decks built from a chat and saved here for verification, history and download. */
export interface Deck { id: string; userId: number; workspaceId: string; title: string; label: string; bytes: number; createdAt: number; updatedAt: number; hasState: boolean }

const DECK_RE = /^deck_[a-f0-9]{24}$/;
export const isDeckId = (v: unknown): v is string => typeof v === "string" && DECK_RE.test(v);
export const deckDir = (id: string, ...p: string[]) => studioDir("decks", id, ...p);
export const MAX_DECK_BYTES = 3 * 1024 * 1024;
const MAX_STATE_BYTES = 4 * 1024 * 1024;
export const REPORT_NAMES = ["verification-report.md", "evidence-report.md"] as const;

type Row = Record<string, unknown>;
const toDeck = (r: Row): Deck => ({
  id: r.id as string, userId: r.user_id as number, workspaceId: r.workspace_id as string, title: r.title as string, label: r.label as string,
  bytes: r.bytes as number, createdAt: r.created_at as number, updatedAt: r.updated_at as number, hasState: Boolean(r.state),
});

export function getDeck(id: string, userId: number): Deck | null {
  if (!isDeckId(id)) return null;
  const r = getDb().prepare("SELECT id,user_id,workspace_id,title,label,bytes,created_at,updated_at,(state IS NOT NULL) state FROM decks WHERE id=? AND user_id=?").get(id, userId) as Row | undefined;
  return r ? toDeck(r) : null;
}

export function listDecks(userId: number, limit = 20): Deck[] {
  return (getDb().prepare("SELECT id,user_id,workspace_id,title,label,bytes,created_at,updated_at,(state IS NOT NULL) state FROM decks WHERE user_id=? ORDER BY updated_at DESC LIMIT ?").all(userId, limit) as Row[]).map(toDeck);
}

export function deckFileName(d: Pick<Deck, "title">) { return `${slugify(d.title)}.html`; }

export interface SaveDeckInput {
  deckId?: string; workspaceId: string; title: string; label: string;
  html?: string; state?: unknown; reports?: Partial<Record<(typeof REPORT_NAMES)[number], string>>;
}

export function saveDeck(userId: number, input: SaveDeckInput): { deck: Deck; externalReferences: string[]; images: InlineReport | null } {
  const title = input.title.replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "Untitled demo";
  let id = input.deckId;
  if (id) {
    if (!getDeck(id, userId)) throw new Error("Deck not found.");
  } else {
    id = `deck_${randomBytes(12).toString("hex")}`;
    getDb().prepare("INSERT INTO decks(id,user_id,workspace_id,title,label,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run(id, userId, input.workspaceId, title, input.label.slice(0, 120), Date.now(), Date.now());
  }
  fs.mkdirSync(deckDir(id, "reports"), { recursive: true, mode: 0o700 });
  let refs: string[] = [];
  let images: InlineReport | null = null;
  if (input.html !== undefined) {
    // Repository images (repo:<path>, /logo.png) are embedded so the deck stays one offline file.
    // Without the workspace (expired or evicted) they can't be read; they are still replaced and reported.
    const ws = getWorkspace(input.workspaceId, userId);
    const r = inlineImages(input.html, ws ? repoDir(ws.id) : null, MAX_DECK_BYTES - Buffer.byteLength(input.html) - 64_000);
    input = { ...input, html: r.html };
    images = r.report;
    const bytes = Buffer.byteLength(input.html!);
    if (bytes > MAX_DECK_BYTES) throw new Error("The deck is larger than 3 MB.");
    fs.writeFileSync(deckDir(id, "deck.html"), input.html!, { mode: 0o600 });
    getDb().prepare("UPDATE decks SET bytes=? WHERE id=?").run(bytes, id);
    refs = scanExternalRefs(input.html!);
  }
  if (input.state !== undefined) {
    const s = JSON.stringify(input.state);
    if (Buffer.byteLength(s) > MAX_STATE_BYTES) throw new Error("The build state is larger than 4 MB.");
    getDb().prepare("UPDATE decks SET state=? WHERE id=?").run(s, id);
  }
  for (const name of REPORT_NAMES) {
    const text = input.reports?.[name];
    if (typeof text === "string") fs.writeFileSync(deckDir(id, "reports", name), text.slice(0, 200_000), { mode: 0o600 });
  }
  getDb().prepare("UPDATE decks SET title=?, updated_at=? WHERE id=?").run(title, Date.now(), id);
  return { deck: getDeck(id, userId)!, externalReferences: refs, images };
}

export function deckHtml(id: string): string | null {
  const f = deckDir(id, "deck.html");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}

export function deckState(id: string): unknown {
  const r = getDb().prepare("SELECT state FROM decks WHERE id=?").get(id) as { state: string | null } | undefined;
  return r?.state ? JSON.parse(r.state) : null;
}

export function deckReports(id: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of REPORT_NAMES) {
    const f = deckDir(id, "reports", n);
    if (fs.existsSync(f)) out[n] = fs.readFileSync(f, "utf8");
  }
  return out;
}

export function deckUrl(id: string) { return `${getConfig().appUrl}/dashboard?deck=${id}`; }

export function deleteDeck(id: string, userId: number): boolean {
  if (!getDeck(id, userId)) return false;
  fs.rmSync(deckDir(id), { recursive: true, force: true });
  getDb().prepare("DELETE FROM decks WHERE id=?").run(id);
  return true;
}

export function latestShots(id: string): string[] {
  const dir = deckDir(id, "verify");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).map((f) => path.join(dir, f));
}
