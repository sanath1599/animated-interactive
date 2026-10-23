import { requireUser, json } from "@/lib/api";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

function installUrl() {
  const slug = getConfig().github.appSlug;
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

export async function GET(req: Request) {
  const r = await requireUser(req);
  if ("response" in r) return json({ user: null, installUrl: installUrl() });
  const { session: s } = r;
  return json({ user: { id: s.userId, login: s.login, name: s.name, avatarUrl: s.avatarUrl }, installUrl: installUrl(), devMode: getConfig().devAuthBypass });
}
