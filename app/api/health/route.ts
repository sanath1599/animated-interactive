import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getConfig } from "@/lib/config";
import { json } from "@/lib/api";

export const runtime = "nodejs";
const exec = promisify(execFile);
const ok = (cmd: string, args: string[]) => exec(cmd, args, { timeout: 5000 }).then(() => true, () => false);

/** Readiness only: booleans and non-sensitive configuration labels. */
export async function GET() {
  const cfg = getConfig();
  const [docker, claude] = await Promise.all([
    cfg.runnerMode === "docker" ? ok("docker", ["info"]) : Promise.resolve(null),
    ok("claude", ["--version"]),
  ]);
  return json({
    ok: true,
    runnerMode: cfg.runnerMode,
    docker,
    claudeCli: claude,
    claudeAuthMode: cfg.claudeAuthMode,
    githubAppConfigured: Boolean(cfg.github.clientId && cfg.github.clientSecret && cfg.github.appId && cfg.github.privateKey),
    devAuthBypass: cfg.devAuthBypass,
  });
}
