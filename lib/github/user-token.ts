import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { seal, unseal, type Session } from "@/lib/auth/session";

interface StoredToken { accessToken: string; refreshToken: string | null; expiresAt: number | null }

/**
 * Keeps each user's GitHub user-to-server token server-side (sealed), so connector calls, which
 * carry no browser cookie, can still list that user's installations. Refreshed when near expiry.
 */
export function saveGithubToken(userId: number, t: StoredToken): void {
  getDb()
    .prepare("INSERT INTO github_tokens(user_id,sealed,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET sealed=excluded.sealed, updated_at=excluded.updated_at")
    .run(userId, seal(t), Date.now());
}

async function refresh(t: StoredToken): Promise<StoredToken | null> {
  const { clientId, clientSecret } = getConfig().github;
  if (!t.refreshToken || !clientId) return null;
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "demo-studio" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: t.refreshToken }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!res.ok || !j.access_token) return null;
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? t.refreshToken, expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : null };
}

/** A Session-shaped object for the GitHub helpers, or null when the user must sign in to the web app again. */
export async function githubSessionFor(userId: number, login = ""): Promise<Session | null> {
  const base = { userId, login, name: null, avatarUrl: null, issuedAt: Date.now() };
  if (getConfig().devAuthBypass) return { ...base, accessToken: "", refreshToken: null, expiresAt: null };
  const row = getDb().prepare("SELECT sealed FROM github_tokens WHERE user_id=?").get(userId) as { sealed: string } | undefined;
  let t = row ? unseal<StoredToken>(row.sealed) : null;
  if (!t) return null;
  if (t.expiresAt && t.expiresAt - Date.now() < 5 * 60_000) {
    t = await refresh(t);
    if (!t) return null;
    saveGithubToken(userId, t);
  }
  return { ...base, accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt };
}
