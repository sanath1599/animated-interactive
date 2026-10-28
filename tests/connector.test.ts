import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { tempDataDir } from "./helpers";

vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => null }));

let oauth: typeof import("@/lib/oauth/server");
let git: typeof import("@/lib/sources/git");
let archive: typeof import("@/lib/sources/archive");
let mcpRoute: typeof import("@/app/api/mcp/route");
let launch: typeof import("@/lib/claude/launch");

beforeAll(async () => {
  tempDataDir();
  process.env.SESSION_SECRET = "x".repeat(40);
  process.env.APP_URL = "https://studio.test";
  process.env.RUNNER_MODE = "local";
  oauth = await import("@/lib/oauth/server");
  git = await import("@/lib/sources/git");
  archive = await import("@/lib/sources/archive");
  mcpRoute = await import("@/app/api/mcp/route");
  launch = await import("@/lib/claude/launch");
  (await import("@/lib/runs/store")).upsertUser({ id: 7, login: "octo", name: null, avatarUrl: null });
});
afterAll(() => { delete process.env.RUNNER_MODE; delete process.env.APP_URL; });

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

function authorize(clientId: string, userId = 7) {
  const { verifier, challenge } = pkce();
  const req = oauth.validateAuthorizeRequest(new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    code_challenge: challenge, code_challenge_method: "S256", state: "s1", resource: "https://studio.test/api/mcp",
  }));
  if ("redirectError" in req) throw new Error(req.redirectError);
  return { code: oauth.createAuthorizationCode(req, userId), verifier };
}

describe("connector OAuth", () => {
  it("registers public clients and rejects unsafe redirect URIs", () => {
    expect(() => oauth.registerClient({ redirect_uris: ["http://evil.example/cb"] })).toThrow();
    expect(() => oauth.registerClient({ redirect_uris: ["https://ok.example/cb"], token_endpoint_auth_method: "client_secret_post" })).toThrow();
    expect(oauth.registerClient({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }).id).toMatch(/^cl_/);
  });

  it("rejects an unregistered redirect URI before redirecting anywhere", () => {
    const c = oauth.registerClient({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect(() => oauth.validateAuthorizeRequest(new URLSearchParams({ client_id: c.id, redirect_uri: "https://evil.example/cb" }))).toThrow();
    const r = oauth.validateAuthorizeRequest(new URLSearchParams({ client_id: c.id, response_type: "code", code_challenge_method: "plain", code_challenge: "x" }));
    expect("redirectError" in r && r.redirectError).toBe("invalid_request");
  });

  it("exchanges a code once with PKCE, then rotates refresh tokens and detects reuse", () => {
    const c = oauth.registerClient({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    const { code, verifier } = authorize(c.id);
    const bad = new URLSearchParams({ grant_type: "authorization_code", client_id: c.id, code, code_verifier: "y".repeat(43) });
    expect(() => oauth.exchangeToken(bad)).toThrow(/PKCE/);
    const { code: code2, verifier: v2 } = authorize(c.id);
    const t = oauth.exchangeToken(new URLSearchParams({ grant_type: "authorization_code", client_id: c.id, code: code2, code_verifier: v2 }));
    expect(oauth.verifyAccessToken(t.access_token)?.userId).toBe(7);
    expect(() => oauth.exchangeToken(new URLSearchParams({ grant_type: "authorization_code", client_id: c.id, code: code2, code_verifier: v2 }))).toThrow(/invalid or expired/);
    void verifier;

    const t2 = oauth.exchangeToken(new URLSearchParams({ grant_type: "refresh_token", client_id: c.id, refresh_token: t.refresh_token }));
    expect(oauth.verifyAccessToken(t.access_token)).toBeNull(); // old family member revoked on rotation
    expect(oauth.verifyAccessToken(t2.access_token)?.userId).toBe(7);
    expect(() => oauth.exchangeToken(new URLSearchParams({ grant_type: "refresh_token", client_id: c.id, refresh_token: t.refresh_token }))).toThrow(/already used/);
    expect(oauth.verifyAccessToken(t2.access_token)).toBeNull(); // reuse revokes the whole family
  });
});

describe("repository sources", () => {
  it("parses Azure DevOps, GitLab and Bitbucket URLs and rejects others", () => {
    const az = git.parseGitUrl("https://dev.azure.com/contoso/Platform/_git/orders-portal?version=GBinitial-import");
    expect(az).toMatchObject({ provider: "azure", branch: "initial-import", cloneUrl: "https://dev.azure.com/contoso/Platform/_git/orders-portal", label: "contoso/Platform/orders-portal" });
    expect(git.parseGitUrl("https://acme.visualstudio.com/Proj/_git/repo")).toMatchObject({ provider: "azure", label: "acme/Proj/repo" });
    expect(git.parseGitUrl("https://gitlab.com/group/sub/app/-/tree/develop")).toMatchObject({ provider: "gitlab", cloneUrl: "https://gitlab.com/group/sub/app.git", branch: "develop" });
    expect(git.parseGitUrl("https://bitbucket.org/ws/app.git")).toMatchObject({ provider: "bitbucket", cloneUrl: "https://bitbucket.org/ws/app.git" });
    expect(git.parseGitUrl("https://evil.example/a/_git/b")).toBeNull();
    expect(git.parseGitUrl("http://dev.azure.com/a/b/_git/c")).toBeNull();
    expect(git.parseGitUrl("https://dev.azure.com/a/../_git/c")).toBeNull();
    expect(git.parseGitUrl("https://gitlab.com/a/b/-/tree/--upload-pack=x")).toBeNull();
    expect(git.parseGitUrl("https://gitlab.com/a/b/-/tree/-x")?.branch).toBeNull();
  });

  it("extracts zips safely: no traversal, skips dependency folders, strips a single root folder", () => {
    const dir = fs.mkdtempSync(`${process.env.DATA_DIR}/zip-`);
    const zip = zipSync({
      "app-main/src/App.tsx": strToU8("export const App = () => null;"),
      "app-main/node_modules/x/index.js": strToU8("x"),
      "app-main/../../escape.txt": strToU8("nope"),
    });
    expect(archive.extractZip(zip, dir)).toBe(1);
    expect(fs.readFileSync(`${dir}/src/App.tsx`, "utf8")).toContain("App");
    expect(fs.existsSync(`${dir}/node_modules`)).toBe(false);
    expect(fs.existsSync(`${process.env.DATA_DIR}/escape.txt`)).toBe(false);
  });
});

describe("connector MCP endpoint", () => {
  let client: Client;
  let token: string;

  beforeAll(async () => {
    const c = oauth.registerClient({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    const { code, verifier } = authorize(c.id);
    token = oauth.exchangeToken(new URLSearchParams({ grant_type: "authorization_code", client_id: c.id, code, code_verifier: verifier })).access_token;
    const handler: typeof fetch = async (input, init) => mcpRoute.POST(new Request(input as string, init));
    client = new Client({ name: "test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL("https://studio.test/api/mcp"), {
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        const req = new Request(url, init);
        if (req.method === "GET" || req.method === "DELETE") return new Response(null, { status: 405 });
        req.headers.set("authorization", `Bearer ${token}`);
        return handler(req.url, { method: req.method, headers: req.headers, body: await req.text() });
      }) as typeof fetch,
    }));
  });

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { type: string; text?: string }[]).find((c) => c.type === "text")?.text ?? "";
    if (r.isError) throw new Error(text);
    return { json: JSON.parse(text), content: r.content as { type: string; data?: string; mimeType?: string }[] };
  };

  it("answers 401 with resource metadata when the token is missing", async () => {
    const res = await mcpRoute.POST(new Request("https://studio.test/api/mcp", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/api/mcp");
  });

  it("lists its tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["finish_demo", "get_deck", "list_branches", "list_sources", "open_workspace", "read_files", "record_generation", "record_usage", "save_deck", "save_demo_plan", "save_demo_screen", "save_demo_styles", "search_code", "start_demo", "upload_archive", "verify_deck", "workspace_status"]);
  });

  it("uploads a zip, prepares a workspace, reads and searches it, and saves a deck", async () => {
    const zip = zipSync({
      "demo/README.md": strToU8("# Demo app\nA tiny app."),
      "demo/package.json": strToU8(JSON.stringify({ name: "demo", dependencies: { react: "19" } })),
      "demo/src/App.tsx": strToU8("export function App() { return <h1 className=\"title\">Orders</h1>; }"),
      "demo/.env": strToU8("SECRET=1"),
    });
    const b64 = Buffer.from(zip).toString("base64");
    const half = Math.floor(zip.length / 2 / 3) * 3; // chunk on a base64 boundary
    const first = await call("upload_archive", { name: "demo.zip", totalBytes: zip.length, offset: 0, chunk: Buffer.from(zip.subarray(0, half)).toString("base64") });
    const done = await call("upload_archive", { name: "demo.zip", uploadId: first.json.uploadId, offset: half, chunk: Buffer.from(zip.subarray(half)).toString("base64") });
    expect(done.json.complete).toBe(true);
    void b64;

    const opened = await call("open_workspace", { source: { type: "upload", uploadId: first.json.uploadId, name: "demo.zip" } });
    let status = (await call("workspace_status", { workspaceId: opened.json.workspaceId })).json;
    for (let i = 0; i < 50 && status.status === "preparing"; i++) {
      await new Promise((r) => setTimeout(r, 50));
      status = (await call("workspace_status", { workspaceId: opened.json.workspaceId })).json;
    }
    expect(status.status).toBe("ready");
    expect(status.readme.text).toContain("Demo app");
    expect(status.excluded).toEqual([".env"]);
    expect(status.tree.map((f: { path: string }) => f.path)).toEqual(["package.json", "README.md", "src/App.tsx"]);

    const files = (await call("read_files", { workspaceId: status.workspaceId, paths: ["src/App.tsx", "../../etc/passwd", ".env"] })).json.files;
    expect(files[0].text).toContain("Orders");
    expect(files[1].error).toBe("Not found");
    expect(files[2].error).toBe("Not found");
    const hits = (await call("search_code", { workspaceId: status.workspaceId, pattern: "className", pathGlob: "src/**" })).json.hits;
    expect(hits).toEqual([{ path: "src/App.tsx", line: 1, text: expect.stringContaining("title") }]);

    const html = `<!doctype html><title>t</title><div id="stage" style="width:200px;height:100px">Hello</div><script>window.__deck={ready:true,position:()=>[0,0],check:()=>({clipped:[],outside:[]})};</script>`;
    const saved = (await call("save_deck", { workspaceId: status.workspaceId, title: "Demo", html, state: { v: 1 }, reports: { "evidence-report.md": "# Evidence" } })).json;
    expect(saved.deckId).toMatch(/^deck_/);
    expect(saved.externalReferences).toEqual([]);
    const got = (await call("get_deck", { deckId: saved.deckId, include: ["html", "state", "reports"] })).json;
    expect(got.html).toBe(html);
    expect(got.state).toEqual({ v: 1 });
    expect(got.reports["evidence-report.md"]).toBe("# Evidence");

    if (!launch.resolveChromePath()) return; // browser verification needs a local Chrome
    const v = await call("verify_deck", { deckId: saved.deckId, views: [{ id: "one", hash: "1.1", width: 800, height: 600 }] });
    expect(v.json.ran).toBe(true);
    expect(v.json.results[0]).toMatchObject({ id: "one", pageErrors: [], blockedRequests: [], issues: [] });
    expect(v.content.some((c) => c.type === "image" && c.mimeType === "image/jpeg")).toBe(true);
  }, 60_000);

  it("keeps workspaces and decks owner-scoped", async () => {
    const ws = await import("@/lib/studio/workspaces");
    const mine = ws.listWorkspaces(7)[0];
    expect(ws.getWorkspace(mine.id, 8)).toBeNull();
    await expect(call("read_files", { workspaceId: "ws_" + "0".repeat(24), paths: ["a"] })).rejects.toThrow(/not found/i);
  });

  it("records builds and Claude usage for the dashboard, deduplicated and owner-scoped", async () => {
    const usage = await import("@/lib/studio/usage");
    const ws = (await import("@/lib/studio/workspaces")).listWorkspaces(7)[0];
    const deck = (await import("@/lib/studio/decks")).listDecks(7)[0];
    const started = (await call("record_generation", { kind: "build", status: "running", phase: "read", title: "Demo", workspaceId: ws.id })).json;
    expect(started.generationId).toMatch(/^gen_[a-f0-9]{24}$/);
    const id = started.generationId;
    const calls = [
      { callId: "a1", stage: "Planning the deck", tier: "complex", promptBytes: 40_000, outputChars: 8_000, images: 2, ms: 60_000, ok: true },
      { callId: "a2", stage: "Rebuilding “Orders”", tier: "complex", promptBytes: 20_000, outputChars: 4_000, images: 0, ms: 30_000, ok: false, errorCode: "rate_limited" },
    ];
    expect((await call("record_usage", { generationId: id, calls })).json.recorded).toBe(2);
    expect((await call("record_usage", { generationId: id, calls })).json.recorded).toBe(0); // resent batch is ignored
    await call("record_generation", { generationId: id, status: "completed", deckId: deck.id, viewsChecked: 12, viewsWithProblems: 1 });

    const [g] = usage.listGenerations(7);
    expect(g).toMatchObject({ id, kind: "build", status: "completed", label: ws.label, deckId: deck.id, deckAvailable: true, viewsChecked: 12, viewsWithProblems: 1, claudeCalls: 2, failedCalls: 1, claudeMs: 90_000 });
    expect(g.estInputTokens).toBe(60_000 / 4 + 2 * 1300);
    expect(g.estOutputTokens).toBe(3_000);
    const sum = usage.usageSummary(7, 7);
    expect(sum.generations).toMatchObject({ total: 1, completed: 1 });
    expect(sum.claude).toMatchObject({ calls: 2, failedCalls: 1, images: 2 });
    expect(sum.daily).toHaveLength(7);
    expect(sum.daily.at(-1)!.calls).toBe(2);
    expect(sum.stages.map((s) => s.stage).sort()).toEqual(["Planning the deck", "Rebuilding"]);
    expect(sum.tools.find((t) => t.tool === "record_usage")!.calls).toBe(2);
    expect(usage.usageSummary(null, 7).users!.map((u) => u.login)).toContain("octo");

    // Another user can't see or write to this generation, and a stale run reads as interrupted.
    expect(usage.listGenerations(8)).toEqual([]);
    expect(() => usage.recordClaudeCalls(8, id, calls)).toThrow(/not found/i);
    await expect(call("record_generation", { generationId: "gen_" + "0".repeat(24), status: "failed" })).rejects.toThrow(/not found/i);
    const stale = usage.recordGeneration(7, { status: "running", title: "Old" });
    (await import("@/lib/db")).getDb().prepare("UPDATE generations SET updated_at=? WHERE id=?").run(Date.now() - usage.STALE_MS - 1000, stale);
    expect(usage.listGenerations(7).find((x) => x.id === stale)!.status).toBe("interrupted");
  });

  it("reports the connector as linked while claude.ai holds a live grant", async () => {
    const usage = await import("@/lib/studio/usage");
    expect(usage.connectorStatus(7, oauth.REFRESH_TTL_MS)).toMatchObject({ connected: true, lastUsedAt: expect.any(Number) });
    expect(usage.connectorStatus(9, oauth.REFRESH_TTL_MS)).toEqual({ connected: false, connectedAt: null, lastUsedAt: null });
  });
  it("builds a demo set up on the dashboard from a claude.ai chat: request, plan, styles, screens, finish", async () => {
    const chat = await import("@/lib/studio/chat-build");
    const uploads = await import("@/lib/studio/uploads");
    const zip = zipSync({ "README.md": strToU8("# Orders"), "src/App.tsx": strToU8("export const App = () => <main className=\"app\"><h1>Orders</h1></main>;") });
    const uploadId = uploads.uploadWhole(7, "orders.zip", Buffer.from(zip).toString("base64"));
    const req = await chat.createChatRequest(7, { type: "upload", uploadId, name: "orders" }, { title: "Orders Hub", details: "Show the orders list", detail: "brief", presenter: "Ana Diaz", organization: "Acme", date: "12 November 2026", language: "French" });
    expect(req.prompt).toContain(`requestId ${req.generationId}`);
    expect(req.prompt).toContain("Animated Technical Interactive");
    expect(req.claudeUrl).toBe(`https://claude.ai/new?q=${encodeURIComponent(req.prompt)}`);
    await expect(call("start_demo", { requestId: "gen_" + "0".repeat(24) })).rejects.toThrow(/not found/i);
    expect(() => chat.startChatBuild(8, { requestId: req.generationId })).toThrow(/not found/i); // another user's request

    const started = (await call("start_demo", { requestId: req.generationId })).json;
    expect(started).toMatchObject({ generationId: req.generationId, workspaceId: req.workspaceId, settings: { title: "Orders Hub", details: "Show the orders list" } });
    expect(started.guide).toContain("save_demo_plan");
    expect(started.guide).toContain("UI fidelity");
    expect(started.guide).toContain("Brief: 4-6 slides");
    expect(started.guide).toContain("in French");
    expect(started.guide).toContain("component tree");
    for (let i = 0; i < 50 && (await call("workspace_status", { workspaceId: req.workspaceId })).json.status === "preparing"; i++) await new Promise((r) => setTimeout(r, 50));

    const planned = (await call("save_demo_plan", {
      generationId: req.generationId, workspaceId: req.workspaceId, title: "Something else", detail: "detailed",
      plan: { product: { name: "Orders", oneLine: "Track orders." }, brand: { accent: "#21356B" }, slides: [
        { id: "Overview", kind: "overview", title: "Home", caption: "Start here.", steps: [{ title: "Orders", caption: "The list.", target: "h1" }], sourceFiles: ["src/App.tsx"] },
        { id: "close", kind: "close", title: "Done", points: [] },
      ] },
    })).json;
    expect(planned.slides.map((s: { id: string }) => s.id)).toEqual(["welcome", "overview", "play", "close"]);
    expect(planned.slides[1].canvasHeight).toBe(540);
    await call("save_demo_styles", { deckId: planned.deckId, css: ".app{font-family:Arial;padding:24px}", classes: ["app"] });
    await expect(call("save_demo_screen", { deckId: planned.deckId, slideId: "close", html: "<p>x</p>" })).rejects.toThrow(/close slide/);
    const deckHtml = (await call("get_deck", { deckId: planned.deckId, include: ["html"] })).json.html;
    expect(deckHtml).toContain(".pf .app{font-family:Arial");
    expect(deckHtml).toContain("Presented by Ana Diaz · Acme · 12 November 2026"); // the dashboard's settings win over what Claude passes
    expect(deckHtml).toContain("<title>Orders Hub</title>");

    if (!launch.resolveChromePath()) return; // browser checks need a local Chrome
    const screen = await call("save_demo_screen", { deckId: planned.deckId, slideId: "overview", html: '<main class="app"><h1>Orders</h1></main>', steps: [{ title: "Orders", caption: "The list.", spotlight: "h1" }] });
    expect(screen.json).toMatchObject({ slideId: "overview", stepsRendered: 1, remainingScreens: [] });
    expect(screen.content.filter((c) => c.type === "image")).toHaveLength(1);
    const done = (await call("finish_demo", { deckId: planned.deckId })).json;
    expect(done.url).toBe(`https://studio.test/dashboard?deck=${planned.deckId}`);
    expect(done.viewsChecked).toBeGreaterThanOrEqual(4);
    const gen = (await import("@/lib/studio/usage")).listGenerations(7, 50).find((x) => x.id === req.generationId)!;
    expect(gen).toMatchObject({ status: "completed", deckId: planned.deckId, deckAvailable: true });
    expect(gen.claudeCalls).toBe(3); // plan, styles, one screen
    const reports = (await call("get_deck", { deckId: planned.deckId, include: ["reports"] })).json.reports;
    expect(reports["verification-report.md"]).toContain("Every slide and step renders");
  }, 120_000);

});

describe("claude.ai install link", () => {
  it("prefills the Add custom connector dialog with the exact connector name and MCP URL", async () => {
    const { claudeInstallUrl, CONNECTOR_NAME } = await import("@/lib/config");
    const u = new URL(claudeInstallUrl());
    expect(u.origin + u.pathname).toBe("https://claude.ai/customize/connectors");
    expect(u.searchParams.get("modal")).toBe("add-custom-connector");
    expect(u.searchParams.get("connectorName")).toBe(CONNECTOR_NAME);
    expect(u.searchParams.get("connectorUrl")).toBe("https://studio.test/api/mcp");
  });
});
