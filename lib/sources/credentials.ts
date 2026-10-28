import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { seal, unseal } from "@/lib/auth/session";
import { DEFAULT_USERNAME, providerForHost, type GitAuth, type GitProvider } from "./git";

/**
 * Read-only access tokens for Azure DevOps, GitLab and Bitbucket. Entered in the web app only,
 * stored sealed, and never returned to the browser, the artifact or Claude.
 */
export interface GitCredential { id: string; provider: GitProvider; host: string; label: string; username: string; createdAt: number }

type Row = { id: string; user_id: number; provider: GitProvider; host: string; label: string; username: string; sealed: string; created_at: number };
const toCred = (r: Row): GitCredential => ({ id: r.id, provider: r.provider, host: r.host, label: r.label, username: r.username, createdAt: r.created_at });

export function listCredentials(userId: number): GitCredential[] {
  return (getDb().prepare("SELECT * FROM git_credentials WHERE user_id=? ORDER BY created_at DESC").all(userId) as Row[]).map(toCred);
}

export function addCredential(userId: number, input: { host: string; label?: string; username?: string; token: string }): GitCredential {
  const host = input.host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const provider = providerForHost(host);
  if (!provider) throw new Error("Unsupported host. Use dev.azure.com, *.visualstudio.com, gitlab.com, bitbucket.org, or a host listed in GIT_EXTRA_HOSTS.");
  const token = input.token.trim();
  if (token.length < 8 || token.length > 512 || /\s/.test(token)) throw new Error("The token looks malformed.");
  const username = (input.username?.trim() || DEFAULT_USERNAME[provider]).slice(0, 100);
  if (!/^[A-Za-z0-9._@+-]{1,100}$/.test(username)) throw new Error("The username contains unsupported characters.");
  const label = (input.label?.trim() || host).slice(0, 80);
  const id = `cred_${randomBytes(10).toString("hex")}`;
  getDb()
    .prepare("INSERT INTO git_credentials(id,user_id,provider,host,label,username,sealed,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, userId, provider, host, label, username, seal({ token }), Date.now());
  return { id, provider, host, label, username, createdAt: Date.now() };
}

export function deleteCredential(userId: number, id: string): boolean {
  return getDb().prepare("DELETE FROM git_credentials WHERE id=? AND user_id=?").run(id, userId).changes > 0;
}

/** Owner-scoped: another user's credential id behaves as missing. */
export function credentialAuth(userId: number, id: string): { cred: GitCredential; auth: GitAuth } | null {
  const r = getDb().prepare("SELECT * FROM git_credentials WHERE id=? AND user_id=?").get(id, userId) as Row | undefined;
  const t = r ? unseal<{ token: string }>(r.sealed) : null;
  return r && t ? { cred: toCred(r), auth: { username: r.username, secret: t.token } } : null;
}

/** The most recent credential the user saved for a host, if any. */
export function credentialForHost(userId: number, host: string): { cred: GitCredential; auth: GitAuth } | null {
  const r = getDb().prepare("SELECT id FROM git_credentials WHERE user_id=? AND host=? ORDER BY created_at DESC LIMIT 1").get(userId, host.toLowerCase()) as { id: string } | undefined;
  return r ? credentialAuth(userId, r.id) : null;
}
