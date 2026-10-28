import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { zipSync, strToU8 } from "fflate";
import puppeteer, { type Browser } from "puppeteer-core";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { tempDataDir } from "./helpers";
import { openBuilder, setupConnector, uploadAndConfigure } from "./artifact-harness";

vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => null }));

/**
 * Drives the built page in headless Chrome. Connector calls reach the real MCP endpoint in-process (real upload,
 * workspace, storage and Chromium verification); Claude replies are canned per stage, so this proves the
 * orchestration and deck pipeline, not Claude's output quality (see tests/live/artifact-live.test.ts for that).
 */
let browser: Browser | null = null;
let client: Client;
let chrome = "";

const PLAN = {
  product: { name: "Orders Hub", oneLine: "Track customer orders from request to delivery." },
  brand: { accent: "#0F6E56", supportsDark: false, logoSvg: null, sources: ["src/styles.css"] },
  dataNote: "Sample data: illustrative",
  slides: [
    { id: "welcome", kind: "welcome", title: "x", caption: "Track orders end to end." },
    { id: "overview", kind: "overview", title: "Home", caption: "Where work starts.", sourceFiles: ["src/App.tsx"], steps: [{ title: "Menu", caption: "Areas.", target: "rail" }] },
    { id: "orders", kind: "area", title: "Orders", caption: "Find an order.", sourceFiles: ["src/App.tsx", "src/styles.css"], steps: [{ title: "List", caption: "All orders." }, { title: "Open", caption: "Details." }] },
    { id: "close", kind: "close", title: "Delivering today", points: [{ text: "One place for orders", source: "src/App.tsx" }] },
  ],
  figures: [{ label: "Work areas", value: 2, source: "src/App.tsx", verified: true }, { label: "Users", value: 900, source: "guess", verified: false }],
  evidence: { sizing: "Two areas.", leftOut: [], dataSources: [{ item: "Orders", source: "sample", status: "illustrative" }], caveats: [] },
};
const SCREENS: Record<string, unknown> = {
  overview: { html: '<div class="shell"><nav class="rail">Orders</nav><main><h1>Orders Hub</h1></main></div>', css: ".shell{display:flex;height:100%}.rail{width:72px;background:#0F1B33;color:#fff}", script: "", steps: [{ title: "Menu", caption: "Areas.", spotlight: ".rail" }], sources: ["src/App.tsx"] },
  orders: { html: '<div class="list"><ul><li class="row">PO-1</li><li class="row">PO-2</li></ul><p class="detail">PO-1 · Sample Customer LLC</p></div>', css: ".list{padding:24px}.detail{display:none}[data-step=\"1\"] .detail{display:block}", script: "api.onStep(function(i){root.querySelector('.row').classList.toggle('sel',i===1);});", steps: [{ title: "List", caption: "All orders." }, { title: "Open", caption: "Details.", spotlight: ".detail" }], sources: ["src/App.tsx"] },
};

beforeAll(async () => {
  // Test the current source, not a stale artifact/dist from an earlier build.
  execFileSync(process.execPath, ["artifact/build.mjs", "https://studio.test"], { cwd: path.resolve(__dirname, "..") });
  chrome = (await import("@/lib/claude/launch")).resolveChromePath();
  tempDataDir();
  process.env.RUNNER_MODE = "local";
  client = await setupConnector(9, "builder");
});
afterAll(async () => { await browser?.close(); });

describe("artifact builder end to end", () => {
  it("uploads a repo, builds, verifies in Chromium, writes reports and offers the download", async () => {
    if (!chrome) return;
    browser = await puppeteer.launch({ executablePath: chrome, headless: true });
    const h = await openBuilder(browser, client, async (prompt) => {
      if (prompt.includes("# Task: choose the files to read")) return { app: { name: "Orders Hub" }, files: ["src/App.tsx", "src/styles.css", "nope.ts"], searches: ["Orders"] };
      if (prompt.includes("# Task: plan the deck")) return PLAN;
      if (prompt.includes("# Task: the product's shared styles")) return { css: ":root{--ink:#111} body{font-family:Arial;color:var(--ink)}", classes: ["shell"], notes: "src/styles.css" };
      if (prompt.includes("# Task: recreate one screen")) return SCREENS[/"id":"([a-z-]+)"/.exec(prompt)![1]];
      if (prompt.includes("# Task: review one recreated screen")) return { verdict: "ok", notes: "Matches." };
      throw new Error("unexpected prompt");
    });
    const zipPath = path.join(process.env.DATA_DIR!, "orders.zip");
    fs.writeFileSync(zipPath, zipSync({
      "orders/README.md": strToU8("# Orders Hub"),
      "orders/package.json": strToU8('{"name":"orders"}'),
      "orders/src/App.tsx": strToU8("export const App = () => <nav className='rail'>Orders</nav>;"),
      "orders/src/styles.css": strToU8(".rail{width:72px;background:#0F1B33}"),
    }));
    await uploadAndConfigure(h, zipPath, "Orders Hub Demo");
    const { page } = h;
    await page.click("#go");
    await page.waitForSelector("#dl", { timeout: 150000 });

    expect(h.errors).toEqual([]);
    expect(h.prompts.every((p) => Buffer.byteLength(p) < 262144)).toBe(true);
    expect(h.prompts.find((p) => p.includes("# Task: plan the deck"))).toContain("=== src/App.tsx ===");
    const report = await page.$eval("pre.report", (e) => e.textContent ?? "");
    expect(report).toContain("| Single self-contained file | PASSED");
    expect(report).toContain("| Script and console errors | PASSED");
    expect(report).toContain("| Clipping and overflow | PASSED");
    expect(report).toContain("| Deep links (#slide.step&v=slug) | PASSED");
    expect(report).toContain("| Fullscreen (F / Escape) | NOT RUN");
    const srcdoc = await page.$eval("#pv", (e) => (e as HTMLIFrameElement).srcdoc);
    expect(srcdoc).toContain("tpl-orders");
    expect(srcdoc).toContain('"label":"Work areas"');
    expect(srcdoc).not.toContain('"label":"Users"'); // unverified figure is not shown as fact
    await page.click("#dl");
    await new Promise((r) => setTimeout(r, 300));
    expect(h.downloads[0]).toMatchObject({ filename: "orders-hub-demo.html" });
    expect(h.downloads[0].data).toBe(srcdoc);
    const evidence = await page.$$eval("pre.report", (els) => els[1]?.textContent ?? "");
    expect(evidence).toContain("Users | 900 | guess | no (unverified, not shown)");

    // The build and every Claude call it made are in the user's history for the dashboard.
    const usage = await import("@/lib/studio/usage");
    let gen = usage.listGenerations(9)[0];
    for (let i = 0; i < 50 && gen?.status !== "completed"; i++) { await new Promise((r) => setTimeout(r, 100)); gen = usage.listGenerations(9)[0]; }
    expect(gen).toMatchObject({ kind: "build", status: "completed", title: "Orders Hub Demo", claudeCalls: h.prompts.length, failedCalls: 0, viewsWithProblems: 0 });
    expect(gen.deckId).toMatch(/^deck_/);
    expect(gen.viewsChecked).toBeGreaterThan(0);
    expect(usage.usageSummary(9, 7).stages.map((s) => s.stage)).toEqual(expect.arrayContaining(["Planning the deck", "Rebuilding"]));
  }, 240_000);
});
