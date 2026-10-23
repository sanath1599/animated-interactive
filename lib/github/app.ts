import { createSign } from "node:crypto";
import { getConfig } from "@/lib/config";

const API = "https://api.github.com";
export const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "demo-studio",
};

export class GithubError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function ghFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { ...GH_HEADERS, Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const hint = res.status === 401 ? "GitHub session expired" : res.status === 403 || res.status === 404 ? "Insufficient permissions or not found" : "GitHub request failed";
    throw new GithubError(`${hint} (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

/** Follows Link rel=next, bounded to avoid runaway pagination. */
export async function ghPaginate<T>(path: string, token: string, pick: (page: unknown) => T[], maxPages = 10): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${API}${path}${path.includes("?") ? "&" : "?"}per_page=100`;
  for (let i = 0; url && i < maxPages; i++) {
    const res: Response = await fetch(url, { headers: { ...GH_HEADERS, Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new GithubError(`GitHub request failed (${res.status})`, res.status);
    out.push(...pick(await res.json()));
    url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1] ?? null;
  }
  return out;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function appJwt(): string {
  const { appId, privateKey } = getConfig().github;
  if (!appId || !privateKey) throw new Error("GitHub App is not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY)");
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify({ iat: now - 30, exp: now + 540, iss: appId }))}`;
  return `${data}.${b64(createSign("RSA-SHA256").update(data).sign(privateKey))}`;
}

/** Short-lived, read-only token scoped to one repository. */
export async function createInstallationToken(installationId: number, repo: string): Promise<string> {
  const r = await ghFetch<{ token: string }>(`/app/installations/${installationId}/access_tokens`, appJwt(), {
    method: "POST",
    body: JSON.stringify({ repositories: [repo], permissions: { contents: "read", metadata: "read" } }),
  });
  return r.token;
}
