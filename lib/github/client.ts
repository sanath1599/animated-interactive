import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getConfig } from "@/lib/config";
import { createInstallationToken, ghFetch, ghPaginate } from "./app";
import type { Session } from "@/lib/auth/session";
import type { Branch, Installation, Repo } from "@/types/github";

const exec = promisify(execFile);

interface ApiRepo {
  id: number; name: string; full_name: string; owner: { login: string; type: string };
  description: string | null; private: boolean; default_branch: string; html_url: string; archived: boolean;
}
const toRepo = (r: ApiRepo, installationId: number): Repo => ({
  id: r.id, name: r.name, fullName: r.full_name, owner: r.owner.login, ownerType: r.owner.type,
  description: r.description, visibility: r.private ? "private" : "public",
  defaultBranch: r.default_branch, url: r.html_url, installationId, archived: r.archived,
});

/** Dev-only: reuse the developer's `gh` login when no GitHub App exists yet. */
async function devToken(): Promise<string> {
  const { stdout } = await exec("gh", ["auth", "token"]);
  return stdout.trim();
}

export async function listInstallations(s: Session): Promise<Installation[]> {
  if (getConfig().devAuthBypass) return [{ id: 0, account: s.login, accountType: "User" }];
  const items = await ghPaginate<{ id: number; account: { login: string; type: string } }>(
    "/user/installations", s.accessToken, (p) => (p as { installations: never[] }).installations,
  );
  return items.map((i) => ({ id: i.id, account: i.account.login, accountType: i.account.type }));
}

export async function listRepos(s: Session): Promise<Repo[]> {
  if (getConfig().devAuthBypass) {
    const t = await devToken();
    const repos = await ghPaginate<ApiRepo>("/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed", t, (p) => p as ApiRepo[], 5);
    return repos.map((r) => toRepo(r, 0));
  }
  const installs = await listInstallations(s);
  const all = await Promise.all(
    installs.map((i) =>
      ghPaginate<ApiRepo>(`/user/installations/${i.id}/repositories`, s.accessToken, (p) => (p as { repositories: ApiRepo[] }).repositories)
        .then((rs) => rs.map((r) => toRepo(r, i.id))),
    ),
  );
  return all.flat();
}

/** Confirms the signed-in user can reach this repo through this installation. */
export async function assertRepoAccess(s: Session, owner: string, repo: string, installationId: number): Promise<Repo> {
  const found = (await listRepos(s)).find((r) => r.owner.toLowerCase() === owner.toLowerCase() && r.name.toLowerCase() === repo.toLowerCase() && r.installationId === installationId);
  if (!found) throw new Error("You don't have access to this repository through the Demo Studio GitHub App.");
  return found;
}

export async function listBranches(s: Session, owner: string, repo: string, installationId: number): Promise<Branch[]> {
  await assertRepoAccess(s, owner, repo, installationId);
  const token = getConfig().devAuthBypass ? await devToken() : await createInstallationToken(installationId, repo);
  const items = await ghPaginate<{ name: string; protected: boolean }>(`/repos/${owner}/${repo}/branches`, token, (p) => p as never[], 5);
  return items.map((b) => ({ name: b.name, protected: b.protected }));
}

/** Token used by the host orchestrator to clone. Never given to the agent container. */
export async function getCloneToken(repo: string, installationId: number): Promise<string> {
  return getConfig().devAuthBypass ? devToken() : createInstallationToken(installationId, repo);
}

export async function fetchGithubUser(token: string) {
  const u = await ghFetch<{ id: number; login: string; name: string | null; avatar_url: string | null }>("/user", token);
  return { id: u.id, login: u.login, name: u.name, avatarUrl: u.avatar_url };
}
