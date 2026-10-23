import { apiError, json, requireUser } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { assertRepoAccess, listBranches } from "@/lib/github/client";
import { createRun, countActive, countRunsSince, getRun, listRuns } from "@/lib/runs/store";
import { ensureRunDirs, runDir } from "@/lib/runs/paths";
import { saveUploads } from "@/lib/runs/uploads";
import { enqueue } from "@/lib/runs/manager";
import { newRunId } from "@/lib/security/ids";
import { createRunSchema } from "@/lib/validation/schemas";
import fs from "node:fs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await requireUser(req);
  if ("response" in r) return r.response;
  return json({ runs: listRuns(r.session.userId) });
}

export async function POST(req: Request) {
  const r = await requireUser(req, { mutating: true });
  if ("response" in r) return r.response;
  const cfg = getConfig();
  const userId = r.session.userId;

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > cfg.maxUploadBytes * cfg.maxUploadFiles + 1_000_000) return apiError("Upload too large", 413);

  let form: FormData;
  try { form = await req.formData(); } catch { return apiError("Invalid form data", 400); }
  const parsed = createRunSchema.safeParse({
    owner: form.get("owner"), repo: form.get("repo"), branch: form.get("branch") || undefined,
    installationId: form.get("installationId"), title: form.get("title") ?? "",
    details: form.get("details") ?? "", pastedData: form.get("pastedData") ?? "",
  });
  if (!parsed.success) return json({ error: "Please fix the highlighted fields.", fields: parsed.error.flatten().fieldErrors }, 400);
  const input = parsed.data;

  if (countActive(userId) >= cfg.maxActiveRunsPerUser) return apiError("You already have a demo running. Wait for it to finish or cancel it.", 409);
  if (countRunsSince(userId, Date.now() - 86400_000) >= cfg.maxRunsPerUserPerDay) return apiError("Daily generation limit reached. Try again tomorrow.", 429);

  let defaultBranch = input.branch;
  try {
    const repo = await assertRepoAccess(r.session, input.owner, input.repo, input.installationId);
    defaultBranch ??= repo.defaultBranch;
    if (input.branch) {
      const branches = await listBranches(r.session, input.owner, input.repo, input.installationId);
      if (!branches.some((b) => b.name === input.branch)) return apiError("That branch does not exist.", 400);
    }
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Repository not accessible", 403);
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const runId = newRunId();
  ensureRunDirs(runId);
  const { saved, errors } = await saveUploads(runId, files, input.pastedData);
  if (errors.length) {
    fs.rmSync(runDir(runId), { recursive: true, force: true });
    return json({ error: errors.join("; ") }, 400);
  }
  createRun({ id: runId, userId, title: input.title, owner: input.owner, repo: input.repo, branch: defaultBranch!, installationId: input.installationId });
  enqueue({ runId, details: input.details, uploads: saved });
  return json({ run: getRun(runId) }, 201);
}
