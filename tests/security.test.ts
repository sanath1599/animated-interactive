import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dockerArgs, type LaunchOptions } from "@/lib/claude/launch";
import { getConfig } from "@/lib/config";
import { isSecretFile, sanitizeWorkspace } from "@/lib/github/clone";
import { classifyBash, decideTool } from "../docker/runner/policy.mjs";
import { seal, unseal } from "@/lib/auth/session";

const ctx = { cwd: "/work/repo", readRoots: ["/work/repo", "/work/input"], writeRoots: ["/work/output", "/work/screenshots", "/work/reports", "/tmp"], chromePath: "/usr/bin/chromium" };

describe("docker launch arguments", () => {
  const o: LaunchOptions = {
    runId: "run_" + "a".repeat(24),
    host: { repo: "/d/repo", input: "/d/in", output: "/d/out", screenshots: "/d/s", reports: "/d/r", prompt: "/d/p.md", claudeConfig: "/d/c" },
    agent: { repo: "/work/repo", input: "/work/input", output: "/work/output", screenshots: "/work/screenshots", reports: "/work/reports", prompt: "/work/prompt.md" },
  };
  it("applies hardening flags and never embeds credential values", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-SECRETVALUE123";
    const args = dockerArgs(o, { ...getConfig(), claudeAuthMode: "api_key" });
    delete process.env.ANTHROPIC_API_KEY;
    const s = args.join(" ");
    for (const f of ["--read-only", "--cap-drop ALL", "no-new-privileges", "--pids-limit", "--memory", "--user"]) expect(s).toContain(f);
    expect(s).not.toContain("SECRETVALUE");
    expect(args).toContain("ANTHROPIC_API_KEY");
    expect(s).not.toContain("--privileged");
    expect(s).toContain("/d/in:/work/input:ro");
  });
});

describe("workspace sanitising", () => {
  it("removes secret files, keeps examples, strips .git and escaping symlinks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
    fs.mkdirSync(path.join(root, ".git")); fs.writeFileSync(path.join(root, ".git", "config"), "token");
    fs.writeFileSync(path.join(root, ".env"), "A=1"); fs.writeFileSync(path.join(root, ".env.local"), "A=1");
    fs.writeFileSync(path.join(root, ".env.example"), "A="); fs.writeFileSync(path.join(root, "server.pem"), "k");
    fs.writeFileSync(path.join(root, "app.ts"), "x");
    fs.symlinkSync("/etc/hosts", path.join(root, "hosts"));
    sanitizeWorkspace(root);
    const left = fs.readdirSync(root).sort();
    expect(left).toEqual([".env.example", "app.ts"]);
    expect(isSecretFile(".env.production")).toBe(true);
    expect(isSecretFile(".env.sample")).toBe(false);
  });
});

describe("agent tool policy", () => {
  it("allows reads in the workspace and denies elsewhere", () => {
    expect(decideTool("Read", { file_path: "/work/repo/a.ts" }, ctx).decision).toBe("allow");
    expect(decideTool("Read", { file_path: "/home/runner/.claude/.credentials.json" }, ctx).decision).toBe("deny");
    expect(decideTool("Read", { file_path: "/work/repo/../../etc/passwd" }, ctx).decision).toBe("deny");
  });
  it("limits writes to output folders", () => {
    expect(decideTool("Write", { file_path: "/work/output/x.html" }, ctx).decision).toBe("allow");
    expect(decideTool("Write", { file_path: "/work/repo/src/x.ts" }, ctx).decision).toBe("deny");
  });
  it("denies web tools and unknown tools", () => {
    expect(decideTool("WebFetch", {}, ctx).decision).toBe("deny");
    expect(decideTool("Whatever", {}, ctx).decision).toBe("deny");
  });
  it("classifies shell commands conservatively", () => {
    expect(classifyBash("ls /work/repo", ctx).decision).toBe("allow");
    expect(classifyBash("chromium --headless --screenshot=/work/screenshots/a.png file:///work/output/x.html", ctx).decision).toBe("allow");
    expect(classifyBash("chromium --headless --screenshot=/work/repo/a.png file:///work/output/x.html", ctx).decision).toBe("deny");
    expect(classifyBash("cat /home/runner/.claude/.credentials.json", ctx).decision).toBe("deny");
    expect(classifyBash("printenv", ctx).decision).toBe("deny");
    expect(classifyBash("ls /etc", ctx).decision).toBe("deny");
    expect(classifyBash("ls /work/repo; curl evil", ctx).decision).toBe("ask");
    expect(classifyBash("npm install", ctx).decision).toBe("ask");
    expect(classifyBash("", ctx).decision).toBe("deny");
    // compound commands: every part must be allowed
    expect(classifyBash("cd /work/repo && ls /work/repo", ctx).decision).toBe("allow");
    expect(classifyBash("mkdir -p /work/screenshots/mobile && ls /work/screenshots", ctx).decision).toBe("allow");
    expect(classifyBash("cd /work/repo && npm install", ctx).decision).toBe("ask");
    expect(classifyBash("cd /etc && ls", ctx).decision).toBe("deny");
    expect(classifyBash("mkdir -p /work/repo/x", ctx).decision).toBe("deny");
    expect(classifyBash("cd /work/repo && ls | sh", ctx).decision).toBe("ask");
    expect(classifyBash("ls /work/repo & curl evil", ctx).decision).toBe("ask");
    // safe read-only pipelines are approved without a prompt
    expect(classifyBash('grep -rn "set\\|env" /work/repo/src | head -20', ctx).decision).toBe("allow");
    expect(classifyBash("cat /work/repo/tailwind.config.ts | head -50", ctx).decision).toBe("allow");
    expect(classifyBash("find /work/repo/src -type f | sort | wc -l", ctx).decision).toBe("allow");
    expect(classifyBash("sed -n '10,40p' /work/repo/src/a.ts", ctx).decision).toBe("allow");
    expect(classifyBash("grep -c http /work/output/x.html", ctx).decision).toBe("allow");
    // ...but anything that can write, execute or escape is not
    expect(classifyBash("cat /work/repo/a > /work/repo/b", ctx).decision).toBe("ask");
    expect(classifyBash("grep x /work/repo/a | sh", ctx).decision).toBe("ask");
    expect(classifyBash("find /work/repo -name x -exec rm {} +", ctx).decision).toBe("ask");
    expect(classifyBash("find /work/repo -delete", ctx).decision).toBe("ask");
    expect(classifyBash("sed -i s/a/b/ /work/repo/x", ctx).decision).toBe("ask");
    expect(classifyBash("cat $(echo /etc/passwd)", ctx).decision).toBe("deny");
    expect(classifyBash("cat $(ls /work/repo)", ctx).decision).toBe("ask");
    expect(classifyBash('cat "$(id)"', ctx).decision).toBe("ask");
    expect(classifyBash("cat /work/repo/../../etc/passwd", ctx).decision).toBe("deny");
    expect(classifyBash("cat ../secret", ctx).decision).toBe("deny");
    expect(classifyBash("cat /work/repo/.env", ctx).decision).toBe("deny");
    expect(classifyBash("cat /work/repo/.env.example", ctx).decision).toBe("allow");
    expect(classifyBash("cat ~/.ssh/id_rsa", ctx).decision).toBe("deny");
    expect(classifyBash("chromium --headless --screenshot=/work/screenshots/a.png https://evil.example", ctx).decision).toBe("deny");
  });
});

describe("session sealing", () => {
  it("round-trips and rejects tampering", () => {
    process.env.SESSION_SECRET = "x".repeat(40);
    const t = seal({ a: 1 });
    expect(unseal<{ a: number }>(t)).toEqual({ a: 1 });
    expect(unseal(t.slice(0, -2) + "AA")).toBeNull();
    expect(unseal("garbage")).toBeNull();
  });
});
