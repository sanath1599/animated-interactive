import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { resolveChromePath } from "@/lib/claude/launch";
import { scanExternalRefs } from "@/lib/artifacts/checks";
import { deckDir, deckHtml } from "./decks";

export interface VerifyView { id: string; hash: string; width: number; height: number; theme?: "light" | "dark" }
export interface ViewResult {
  id: string; hash?: string; width?: number; height?: number; theme?: string; skipped?: string;
  consoleErrors: string[]; pageErrors: string[]; blockedRequests: string[]; issues: string[];
  deck: { at: unknown; check: unknown; horizontalOverflow: boolean } | null; screenshot: string | null;
}
export interface VerifyResult { ran: boolean; reason?: string; bytes: number; externalReferences: string[]; results: ViewResult[] }

const VIEW_ID = /^[a-z0-9-]{1,48}$/;
const HASH = /^[A-Za-z0-9.&=_-]{0,120}$/;
export const MAX_VIEWS = 10;

export function validateViews(views: VerifyView[]): VerifyView[] {
  if (!views.length || views.length > MAX_VIEWS) throw new Error(`Request 1-${MAX_VIEWS} views per call.`);
  const seen = new Set<string>();
  return views.map((v) => {
    if (!VIEW_ID.test(v.id) || seen.has(v.id)) throw new Error(`Invalid or duplicate view id: ${v.id}`);
    if (!HASH.test(v.hash)) throw new Error(`Invalid hash for ${v.id}`);
    seen.add(v.id);
    return { id: v.id, hash: v.hash, width: Math.min(Math.max(Math.round(v.width), 320), 1920), height: Math.min(Math.max(Math.round(v.height), 480), 1200), theme: v.theme === "dark" ? "dark" : "light" };
  });
}

/**
 * Renders the deck in headless Chromium. In docker mode the browser runs in the runner image with
 * no network, a read-only root and dropped capabilities; locally it uses the developer's Chrome.
 */
export async function verifyDeck(deckId: string, rawViews: VerifyView[]): Promise<VerifyResult> {
  const html = deckHtml(deckId);
  if (!html) throw new Error("Save the deck before verifying it.");
  const views = validateViews(rawViews);
  const base: VerifyResult = { ran: false, bytes: Buffer.byteLength(html), externalReferences: scanExternalRefs(html), results: [] };
  const cfg = getConfig();
  const outDir = deckDir(deckId, "verify");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const docker = cfg.runnerMode === "docker";
  const chrome = docker ? "/usr/bin/chromium" : resolveChromePath();
  if (!chrome) return { ...base, reason: "No Chrome or Chromium binary is available on the server." };

  const specHost = path.join(outDir, "spec.json");
  const spec = docker
    ? { html: "/deck/deck.html", outDir: "/out", views, chrome, noSandbox: true, budgetMs: 100_000 }
    : { html: deckDir(deckId, "deck.html"), outDir, views, chrome, noSandbox: false, budgetMs: 100_000 };
  fs.writeFileSync(specHost, JSON.stringify(spec));

  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;
  const [cmd, args] = docker
    ? ["docker", [
        "run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,exec,nosuid,size=512m",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "256", "--memory", "2g", "--cpus", "2",
        "--user", `${uid}:${gid}`, "--label", "demo-studio=1",
        "-v", `${deckDir(deckId, "deck.html")}:/deck/deck.html:ro`, "-v", `${outDir}:/out:rw`,
        "-e", "VERIFY_SPEC=/out/spec.json", "-e", "HOME=/tmp",
        "--entrypoint", "node", cfg.runnerImage, "/opt/runner/verify-deck.mjs",
      ]] as const
    : [process.execPath, [path.join(process.cwd(), "docker/runner/verify-deck.mjs")]] as const;

  const stderr = await new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, [...args], { shell: false, stdio: ["ignore", "ignore", "pipe"], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? "/tmp", VERIFY_SPEC: specHost } as unknown as NodeJS.ProcessEnv });
    let err = "";
    child.stderr.on("data", (d) => { if (err.length < 4000) err += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 115_000);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", () => { clearTimeout(timer); resolve(err); });
  });

  const resultsFile = path.join(outDir, "results.json");
  if (!fs.existsSync(resultsFile)) return { ...base, reason: `The browser check did not complete. ${stderr.trim().split("\n").pop() ?? ""}`.trim() };
  const parsed = JSON.parse(fs.readFileSync(resultsFile, "utf8")) as { results: ViewResult[] };
  return { ...base, ran: true, results: parsed.results };
}

export function screenshotPath(deckId: string, file: string): string | null {
  if (!/^[a-z0-9-]{1,48}\.jpg$/.test(file)) return null;
  const p = deckDir(deckId, "verify", file);
  return fs.existsSync(p) ? p : null;
}
