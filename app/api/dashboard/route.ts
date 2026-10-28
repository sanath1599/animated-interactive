import { json, requireUser } from "@/lib/api";
import { CONNECTOR_NAME, claudeInstallUrl, getConfig, isAdmin, mcpUrl } from "@/lib/config";
import { listInstallations } from "@/lib/github/client";
import { REFRESH_TTL_MS } from "@/lib/oauth/server";
import { listCredentials } from "@/lib/sources/credentials";
import { connectorStatus, listGenerations, usageSummary } from "@/lib/studio/usage";
import { chatPrompt, claudeChatUrl } from "@/lib/studio/chat-build";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Everything the dashboard shows: setup state (GitHub, repository access, the claude.ai connector),
 * build history and usage. `?status=1` returns only the connector state, for polling while the user
 * adds the connector in claude.ai.
 */
export async function GET(req: Request) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  const { session } = r;
  const connector = connectorStatus(session.userId, REFRESH_TTL_MS);
  const params = new URL(req.url).searchParams;
  if (params.get("status") === "1") return json({ connector });

  const cfg = getConfig();
  const admin = isAdmin(session.login);
  const scope = admin && params.get("scope") === "all" ? "all" : "me";
  const days = [7, 30, 90].includes(Number(params.get("days"))) ? Number(params.get("days")) : 30;

  let installations: number | null = null;
  try { installations = (await listInstallations(session)).length; } catch { /* GitHub unreachable or token expired: show as unknown */ }

  return json({
    user: { login: session.login, name: session.name, avatarUrl: session.avatarUrl, admin },
    github: { installations, installUrl: cfg.github.appSlug ? `https://github.com/apps/${cfg.github.appSlug}/installations/new` : null },
    connector: { ...connector, name: CONNECTOR_NAME, mcpUrl: mcpUrl(), installUrl: claudeInstallUrl() },
    artifactUrl: cfg.artifactUrl || null,
    credentials: listCredentials(session.userId),
    // Builds set up here and handed to a chat keep their claude.ai link until they finish.
    generations: withChatLinks(session.userId, listGenerations(session.userId, 100)),
    usage: usageSummary(scope === "all" ? null : session.userId, days),
    scope,
  });
}

function withChatLinks<G extends { id: string; title: string; status: string }>(userId: number, gens: G[]): (G & { chat: boolean; claudeUrl: string | null })[] {
  const ids = new Set((getDb().prepare("SELECT generation_id FROM chat_requests WHERE user_id=?").all(userId) as { generation_id: string }[]).map((r) => r.generation_id));
  return gens.map((x) => ({ ...x, chat: ids.has(x.id), claudeUrl: ids.has(x.id) && x.status !== "completed" ? claudeChatUrl(chatPrompt(x.id, x.title)) : null }));
}
