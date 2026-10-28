import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import type { Browser, Page } from "puppeteer-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const ROOT = path.resolve(import.meta.dirname, "..");
export type SampleFn = (prompt: string, opts: { modelTier?: string; images: { data: string; type: string }[] }) => Promise<unknown>;

/** Builds the artifact page and an MCP client authorised as `userId` against the in-process connector route. */
export async function setupConnector(userId: number, login: string): Promise<Client> {
  process.env.SESSION_SECRET ??= "h".repeat(40);
  process.env.APP_URL = "https://studio.test";
  execFileSync(process.execPath, [path.join(ROOT, "artifact/build.mjs"), "https://studio.test"]);
  const oauth = await import("@/lib/oauth/server");
  (await import("@/lib/runs/store")).upsertUser({ id: userId, login, name: null, avatarUrl: null });
  const c = oauth.registerClient({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
  const verifier = randomBytes(32).toString("base64url");
  const req = oauth.validateAuthorizeRequest(new URLSearchParams({ response_type: "code", client_id: c.id, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }));
  if ("redirectError" in req) throw new Error(req.redirectError);
  const token = oauth.exchangeToken(new URLSearchParams({ grant_type: "authorization_code", client_id: c.id, code: oauth.createAuthorizationCode(req, userId), code_verifier: verifier })).access_token;
  const route = await import("@/app/api/mcp/route");
  const client = new Client({ name: "harness", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://studio.test/api/mcp"), {
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const r = new Request(url, init);
      if (r.method !== "POST") return new Response(null, { status: 405 });
      r.headers.set("authorization", `Bearer ${token}`);
      return route.POST(new Request(r.url, { method: "POST", headers: r.headers, body: await r.text() }));
    }) as typeof fetch,
  }));
  return client;
}

export interface Harness { page: Page; errors: string[]; prompts: string[]; downloads: { filename: string; data: string }[] }

/**
 * Opens the built page with a stubbed `window.claude`: mcp → the real connector, sample → `sample`,
 * downloads → captured. Network is blocked except the zip library, which is served from node_modules.
 */
export async function openBuilder(browser: Browser, client: Client, sample: SampleFn): Promise<Harness> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const h: Harness = { page, errors: [], prompts: [], downloads: [] };
  page.on("pageerror", (e) => h.errors.push(String((e as Error).message)));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_FAILED")) h.errors.push("console: " + m.text()); });

  await page.exposeFunction("__mcpCall", async (tool: string, input: Record<string, unknown>) => {
    const r = await client.callTool({ name: tool, arguments: input }, undefined, { timeout: 180_000 });
    const content = r.content as { type: string; text?: string }[];
    const text = content.find((x) => x.type === "text")?.text ?? "";
    if (r.isError) return { error: { code: "tool_error", message: text } };
    let payload: unknown = text;
    try { payload = JSON.parse(text); } catch { /* plain text */ }
    return { payload, content };
  });
  await page.exposeFunction("__sample", async (prompt: string, opts: { modelTier?: string; images: { data: string; type: string }[] }) => {
    h.prompts.push(prompt);
    try { return { value: await sample(prompt, opts) }; } catch (e) { return { error: { code: (e as { code?: string }).code ?? "upstream_error", message: String((e as Error).message ?? e) } }; }
  });
  await page.exposeFunction("__download", (filename: string, data: string) => { h.downloads.push({ filename, data }); });
  await page.evaluateOnNewDocument(() => {
    const w = window as unknown as Record<string, (...a: unknown[]) => Promise<{ error?: unknown; value?: unknown; payload?: unknown; content?: unknown }>>;
    const toB64 = (b: Blob) => new Promise<{ data: string; type: string }>((res) => { const r = new FileReader(); r.onload = () => res({ data: String(r.result).split(",")[1], type: b.type || "image/png" }); r.readAsDataURL(b); });
    const mcp = {
      listTools: async () => ({ servers: [{ server: "Animated Technical Interactive", authStatus: "connected", tools: [] }] }),
      callTool: async (_s: string, tool: string, input: unknown) => { const r = await w.__mcpCall(tool, input); if (r.error) throw r.error; return r; },
    };
    const sample = Object.assign(async () => ({ text: "" }), {
      json: async (prompt: string, o: { modelTier?: string; images?: Blob[] } = {}) => {
        const images = await Promise.all((o.images ?? []).map(toB64));
        const r = await w.__sample(prompt, { modelTier: o.modelTier, images });
        if (r.error) throw r.error;
        return r.value;
      },
      limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ["image/png", "image/jpeg"] } }),
    });
    const downloads = { save: async (o: { filename: string; data: string }) => { await w.__download(o.filename, o.data); return { status: "saved" }; } };
    (window as unknown as { claude: unknown }).claude = { use: async (n: string) => ({ mcp, sample, downloads } as Record<string, unknown>)[n] ?? null };
  });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith("https://cdn.jsdelivr.net/npm/fflate@")) return void r.respond({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(ROOT, "node_modules/fflate/umd/index.js"), "utf8") });
    if (/^https?:/.test(u)) return void r.abort();
    void r.continue();
  });
  await page.goto("file://" + path.join(ROOT, "artifact/dist/index.html"), { waitUntil: "load" });
  return h;
}

/** Connect → upload a zip → wait for the configure step. */
export async function uploadAndConfigure(h: Harness, zipPath: string, title: string, details = "", samples: string[] = []) {
  const { page } = h;
  await page.waitForSelector("#connect", { timeout: 15000 });
  await page.click("#connect");
  await page.waitForSelector('[data-tab="upload"]');
  await page.click('[data-tab="upload"]');
  const input = await page.$("#zip");
  await (input as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(zipPath);
  await page.waitForFunction(() => !(document.getElementById("fetch") as HTMLButtonElement).disabled);
  await page.click("#fetch");
  await page.waitForSelector("#title", { timeout: 120000 });
  await page.type("#title", title);
  if (details) await page.$eval("#details", (e, v) => { (e as HTMLTextAreaElement).value = v; e.dispatchEvent(new Event("change")); }, details);
  if (samples.length) {
    const s = await page.$("#samples");
    await (s as unknown as { uploadFile(...p: string[]): Promise<void> }).uploadFile(...samples);
    await page.waitForFunction((n) => document.querySelectorAll(".files li").length >= n, { timeout: 15000 }, samples.length);
    if (details) await page.$eval("#details", (e, v) => { (e as HTMLTextAreaElement).value = v; e.dispatchEvent(new Event("change")); }, details);
  }
}
