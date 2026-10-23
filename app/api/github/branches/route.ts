import { apiError, json, requireUser } from "@/lib/api";
import { listBranches } from "@/lib/github/client";
import { isOwner, isRepoName } from "@/lib/security/ids";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  const q = new URL(req.url).searchParams;
  const owner = q.get("owner");
  const repo = q.get("repo");
  const inst = Number(q.get("installationId"));
  if (!isOwner(owner) || !isRepoName(repo) || !Number.isInteger(inst) || inst < 0) return apiError("Invalid repository", 400);
  try {
    return json({ branches: await listBranches(r.session, owner, repo, inst) });
  } catch (e) {
    return apiError(e instanceof Error && /access/i.test(e.message) ? e.message : "Could not load branches.", 502);
  }
}
