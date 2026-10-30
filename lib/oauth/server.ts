import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { getConfig } from "@/lib/config";

/**
 * A small OAuth 2.1 authorization server for the Studio connector (MCP).
 * Public clients only (claude.ai registers itself dynamically), authorization code + PKCE S256,
 * opaque tokens stored as SHA-256 hashes, refresh-token rotation with reuse detection.
 */

export const SCOPE = "studio";
const CODE_TTL_MS = 5 * 60_000;
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_MS = 30 * 86400_000;
const MAX_REDIRECTS = 5;

export const mcpResource = () => `${getConfig().appUrl}/api/mcp`;
export const issuer = () => getConfig().appUrl;

const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const token = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    // Every redirect back to the client (codes and errors) carries iss, so clients such as ChatGPT can check it.
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [SCOPE],
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "antm",
  };
}

/** Redirect URIs must be https, or http on a loopback host (native/dev clients). */
export function isAllowedRedirect(uri: string): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
}

export interface Client { id: string; name: string; redirectUris: string[] }

export function registerClient(body: unknown): Client {
  const b = (body ?? {}) as { client_name?: unknown; redirect_uris?: unknown; token_endpoint_auth_method?: unknown; grant_types?: unknown };
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > MAX_REDIRECTS || !uris.every(isAllowedRedirect)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be 1-5 https (or loopback http) URLs");
  }
  // Every client is registered as a public client secured by PKCE. A client asking for a secret-based method
  // (some send client_secret_basic by default) is told so in the response (token_endpoint_auth_method "none"),
  // as RFC 7591 allows, instead of being refused.
  const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 100) : "MCP client";
  const id = `cl_${randomBytes(16).toString("hex")}`;
  getDb().prepare("INSERT INTO oauth_clients(id,name,redirect_uris,created_at) VALUES(?,?,?,?)").run(id, name, JSON.stringify(uris), Date.now());
  return { id, name, redirectUris: uris };
}

export function getClient(id: string): Client | null {
  const r = getDb().prepare("SELECT * FROM oauth_clients WHERE id=?").get(id) as { id: string; name: string; redirect_uris: string } | undefined;
  return r ? { id: r.id, name: r.name, redirectUris: JSON.parse(r.redirect_uris) as string[] } : null;
}

export interface AuthorizeRequest {
  clientId: string; clientName: string; redirectUri: string; state: string | null;
  challenge: string; scope: string; resource: string;
}

/**
 * Validates an authorization request. Errors that make the redirect URI untrustworthy throw
 * (shown to the user); everything else is returned so the caller can redirect with ?error=.
 */
export function validateAuthorizeRequest(p: URLSearchParams): AuthorizeRequest | { redirectError: string; redirectUri: string; state: string | null } {
  const client = getClient(p.get("client_id") ?? "");
  if (!client) throw new OAuthError("invalid_client", "Unknown client. Remove the connector in Claude or ChatGPT and add it again.");
  const redirectUri = p.get("redirect_uri") ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!client.redirectUris.includes(redirectUri)) throw new OAuthError("invalid_request", "The redirect URI does not match the registered client.");
  const state = p.get("state");
  const fail = (redirectError: string) => ({ redirectError, redirectUri, state });
  if (p.get("response_type") !== "code") return fail("unsupported_response_type");
  const challenge = p.get("code_challenge") ?? "";
  if (p.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return fail("invalid_request");
  const scope = p.get("scope")?.trim() || SCOPE;
  if (scope.split(/\s+/).some((s) => s !== SCOPE)) return fail("invalid_scope");
  const resource = p.get("resource") ?? mcpResource();
  if (resource.replace(/\/$/, "") !== mcpResource()) return fail("invalid_target");
  return { clientId: client.id, clientName: client.name, redirectUri, state, challenge, scope, resource: mcpResource() };
}

export function createAuthorizationCode(req: AuthorizeRequest, userId: number): string {
  const code = token("ati_code");
  getDb()
    .prepare("INSERT INTO oauth_codes(code_hash,client_id,user_id,redirect_uri,challenge,scope,resource,expires_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(hash(code), req.clientId, userId, req.redirectUri, req.challenge, req.scope, req.resource, Date.now() + CODE_TTL_MS);
  return code;
}

export interface TokenResponse { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string }

function issue(clientId: string, userId: number, scope: string, resource: string, family: string): TokenResponse {
  const access = token("ati_at");
  const refresh = token("ati_rt");
  const ins = getDb().prepare("INSERT INTO oauth_tokens(token_hash,kind,client_id,user_id,scope,resource,family,expires_at) VALUES(?,?,?,?,?,?,?,?)");
  ins.run(hash(access), "access", clientId, userId, scope, resource, family, Date.now() + ACCESS_TTL_S * 1000);
  ins.run(hash(refresh), "refresh", clientId, userId, scope, resource, family, Date.now() + REFRESH_TTL_MS);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope };
}

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function exchangeToken(form: URLSearchParams): TokenResponse {
  const db = getDb();
  const grant = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";
  if (!getClient(clientId)) throw new OAuthError("invalid_client", "Unknown client", 401);

  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const row = db.prepare("SELECT * FROM oauth_codes WHERE code_hash=?").get(hash(code)) as
      | { client_id: string; user_id: number; redirect_uri: string; challenge: string; scope: string; resource: string; expires_at: number } | undefined;
    db.prepare("DELETE FROM oauth_codes WHERE code_hash=? OR expires_at<?").run(hash(code), Date.now()); // single use
    if (!row || row.expires_at < Date.now() || row.client_id !== clientId) throw new OAuthError("invalid_grant", "The authorization code is invalid or expired");
    if ((form.get("redirect_uri") ?? row.redirect_uri) !== row.redirect_uri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
    const verifier = form.get("code_verifier") ?? "";
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || s256(verifier) !== row.challenge) throw new OAuthError("invalid_grant", "PKCE verification failed");
    return issue(clientId, row.user_id, row.scope, row.resource, randomBytes(12).toString("hex"));
  }

  if (grant === "refresh_token") {
    const presented = form.get("refresh_token") ?? "";
    const row = db.prepare("SELECT * FROM oauth_tokens WHERE token_hash=? AND kind='refresh'").get(hash(presented)) as
      | { client_id: string; user_id: number; scope: string; resource: string; family: string; expires_at: number; revoked: number } | undefined;
    if (!row || row.client_id !== clientId || row.expires_at < Date.now()) throw new OAuthError("invalid_grant", "The refresh token is invalid or expired");
    if (row.revoked) {
      // A rotated refresh token was replayed: treat the whole family as compromised.
      db.prepare("UPDATE oauth_tokens SET revoked=1 WHERE family=?").run(row.family);
      throw new OAuthError("invalid_grant", "The refresh token was already used");
    }
    db.prepare("UPDATE oauth_tokens SET revoked=1 WHERE family=?").run(row.family);
    return issue(clientId, row.user_id, row.scope, row.resource, row.family);
  }

  throw new OAuthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported");
}

export interface AccessGrant { userId: number; clientId: string; scopes: string[]; expiresAt: number; token: string }

export function verifyAccessToken(bearer: string): AccessGrant | null {
  if (!bearer.startsWith("ati_at_")) return null;
  const row = getDb().prepare("SELECT * FROM oauth_tokens WHERE token_hash=? AND kind='access'").get(hash(bearer)) as
    | { client_id: string; user_id: number; scope: string; resource: string; expires_at: number; revoked: number } | undefined;
  if (!row || row.revoked || row.expires_at < Date.now() || row.resource !== mcpResource()) return null;
  return { userId: row.user_id, clientId: row.client_id, scopes: row.scope.split(" "), expiresAt: Math.floor(row.expires_at / 1000), token: bearer };
}

export function revokeToken(presented: string): void {
  const row = getDb().prepare("SELECT family FROM oauth_tokens WHERE token_hash=?").get(hash(presented)) as { family: string } | undefined;
  if (row) getDb().prepare("UPDATE oauth_tokens SET revoked=1 WHERE family=?").run(row.family);
}

export function pruneOAuth(): void {
  const now = Date.now();
  getDb().prepare("DELETE FROM oauth_codes WHERE expires_at<?").run(now);
  getDb().prepare("DELETE FROM oauth_tokens WHERE expires_at<?").run(now);
}
