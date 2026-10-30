import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { ARCHIVE_LIMITS } from "@/lib/sources/archive";

/**
 * Zip uploads from the dashboard's New demo form, stored until a workspace is opened from them.
 */
const UP_RE = /^up_[a-f0-9]{24}$/;
const file = (id: string) => path.join(getConfig().dataDir, "studio", "uploads", `${id}.zip`);
const ZIP_MAGIC = [0x50, 0x4b];

export function beginUpload(userId: number, name: string, total: number): string {
  if (!Number.isInteger(total) || total <= 0 || total > ARCHIVE_LIMITS.maxArchiveBytes) throw new Error("The archive must be between 1 byte and 100 MB.");
  const id = `up_${randomBytes(12).toString("hex")}`;
  fs.mkdirSync(path.dirname(file(id)), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file(id), new Uint8Array(0), { mode: 0o600 });
  getDb().prepare("INSERT INTO uploads(id,user_id,name,total,created_at) VALUES(?,?,?,?,?)").run(id, userId, name.slice(0, 120), total, Date.now());
  return id;
}

/** Appends one chunk at `offset`; chunks must arrive in order. Returns bytes received so far. */
export function appendChunk(userId: number, id: string, offset: number, base64: string): { received: number; total: number } {
  const row = UP_RE.test(id) ? getDb().prepare("SELECT * FROM uploads WHERE id=? AND user_id=?").get(id, userId) as { received: number; total: number } | undefined : undefined;
  if (!row) throw new Error("Upload not found.");
  if (offset !== row.received) throw new Error(`Expected the chunk at offset ${row.received}.`);
  const buf = Buffer.from(base64, "base64");
  if (!buf.length || row.received + buf.length > row.total) throw new Error("Chunk does not fit the declared size.");
  if (offset === 0 && (buf[0] !== ZIP_MAGIC[0] || buf[1] !== ZIP_MAGIC[1])) throw new Error("Only .zip archives are accepted.");
  fs.appendFileSync(file(id), buf);
  const received = row.received + buf.length;
  getDb().prepare("UPDATE uploads SET received=? WHERE id=?").run(received, id);
  return { received, total: row.total };
}

export function uploadWhole(userId: number, name: string, base64: string): string {
  const size = Math.floor((base64.length * 3) / 4);
  const id = beginUpload(userId, name, Math.max(1, size));
  const { received } = appendChunk(userId, id, 0, base64);
  getDb().prepare("UPDATE uploads SET total=? WHERE id=?").run(received, id);
  return id;
}

/** Path of a complete upload owned by this user, or null. */
export function uploadPath(userId: number, id: string): string | null {
  if (!UP_RE.test(id)) return null;
  const row = getDb().prepare("SELECT received,total FROM uploads WHERE id=? AND user_id=?").get(id, userId) as { received: number; total: number } | undefined;
  return row && row.received === row.total && fs.existsSync(file(id)) ? file(id) : null;
}
