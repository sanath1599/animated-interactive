import { apiError, json, requireUser } from "@/lib/api";
import { listInstallations, listRepos } from "@/lib/github/client";
import { GithubError } from "@/lib/github/app";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  try {
    const [repos, installations] = await Promise.all([listRepos(r.session), listInstallations(r.session)]);
    return json({ repos, installations });
  } catch (e) {
    if (e instanceof GithubError) return apiError(e.status === 401 ? "Your GitHub session expired. Please sign in again." : e.message, e.status === 401 ? 401 : 502);
    console.error("repos:", e instanceof Error ? e.message : e);
    return apiError("Could not load repositories from GitHub.", 502);
  }
}
