import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { tempDataDir } from "./helpers";

vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => null }));

interface Assembler {
  scopeCss(css: string, scope: string): string;
  cleanHtml(html: string): string;
  assembleDeck(o: unknown): string;
  verificationViews(plan: unknown, gen: unknown, theme?: "light" | "dark"): { id: string; hash: string; width: number; height: number; theme: "light" | "dark" }[];
}
let A: Assembler;
const dir = path.resolve(import.meta.dirname, "../deck");

beforeAll(() => {
  tempDataDir();
  process.env.RUNNER_MODE = "local";
  const ctx = { globalThis: {} as Record<string, unknown> };
  vm.runInNewContext(fs.readFileSync(path.join(dir, "deck-assembler.js"), "utf8"), ctx);
  A = ctx.globalThis.DeckAssembler as Assembler;
});

const plan = {
  brand: { accent: "#21356B", supportsDark: false, logoSvg: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#21356B"/></svg>' },
  dataNote: "Sample data: illustrative.",
  slides: [
    { id: "welcome", kind: "welcome", title: "Orders Hub", caption: "See how orders move from request to delivery." },
    { id: "overview", kind: "overview", title: "The home screen", eyebrow: "Overview", caption: "Everything starts here." },
    { id: "orders", kind: "area", title: "Track an order", eyebrow: "Orders", caption: "Filter and open orders.", navLabel: "Orders" },
    { id: "play", kind: "play", title: "Your turn", caption: "Try it yourself." },
    { id: "close", kind: "close", title: "Already delivering", points: [{ text: "Four work areas", source: "src/Rail.tsx" }], figures: [{ label: "Work areas", value: "4", source: "src/Rail.tsx" }] },
  ],
};
const gen = {
  overview: {
    html: '<div class="shell"><nav class="rail"><a class="nav-orders">Orders</a></nav><main><h1 class="hello">Welcome back</h1><button class="new" onclick="alert(1)">New order</button></main></div><script>alert(1)</script>',
    css: "body{margin:0} .shell{display:flex;height:100%;font-family:Arial} .rail{width:72px;background:#0F1B33;color:#fff} main{padding:24px} [data-theme=dark] .shell{background:#000}",
    steps: [{ title: "Navigation", caption: "The left rail.", spotlight: ".rail" }, { title: "Start", caption: "Create an order.", spotlight: ".new" }],
  },
  orders: {
    html: '<div class="list"><input class="q" placeholder="Search"><ul class="rows"><li>PO-1</li><li>PO-2</li></ul><p class="detail">Pick an order</p></div>',
    css: ".list{padding:24px} .detail{display:none} [data-step=\"1\"] .detail{display:block}",
    script: "var q=root.querySelector('.q');q.addEventListener('input',function(){var v=q.value.toLowerCase();root.querySelectorAll('.rows li').forEach(function(li){li.hidden=li.textContent.toLowerCase().indexOf(v)<0;});});api.onStep(function(i){root.querySelector('.detail').textContent=i===1?'PO-1 selected':'Pick an order';});",
    steps: [{ title: "Search", caption: "Find an order." }, { title: "Open", caption: "See its details.", spotlight: ".detail" }],
  },
};

describe("deck assembler", () => {
  it("scopes generated CSS, including root selectors, media queries and theme hooks", () => {
    const out = A.scopeCss(":root{--a:1} body{margin:0} .x,.y{color:red} @media (max-width:900px){.x{color:blue}} @keyframes k{from{opacity:0}} [data-theme=dark] .x{color:#fff} @import url(x.css);", ".pf");
    expect(out).toContain(".pf{--a:1}");
    expect(out).toContain(".pf .x, .pf .y{color:red}");
    expect(out).toContain("@media (max-width:900px){.pf .x{color:blue}}");
    expect(out).toContain("@keyframes k{from{opacity:0}}");
    expect(out).toContain(".pf[data-theme=dark] .x{color:#fff}");
    expect(out).not.toContain("@import");
  });

  it("strips scripts, inline handlers and external loads from generated markup", () => {
    const out = A.cleanHtml('<img src="https://x.test/a.png"><button onclick="steal()">b</button><script>x()</script><link rel="stylesheet" href="//cdn/x.css">');
    expect(out).not.toMatch(/script|onclick|https:|<link/);
  });

  it("builds the deck in one colour mode, with no theme switch", () => {
    const base = { runtimeCss: "", runtimeJs: "", title: "Orders Hub", plan, foundation: { css: "" }, slides: gen };
    const dark = A.assembleDeck({ ...base, theme: "dark" });
    expect(dark).toMatch(/^<!doctype html>\n<html lang="en" data-theme="dark">/);
    expect(dark).not.toContain("dk-theme");
    const light = A.assembleDeck(base);
    expect(light).toMatch(/<html lang="en">/);
    const views = A.verificationViews(plan, gen, "dark");
    expect(new Set(views.map((v) => v.theme))).toEqual(new Set(["dark"]));
    expect(views.some((v) => v.hash.includes("theme="))).toBe(false);
    expect(views.filter((v) => v.width < 600)).toHaveLength(3);
  });

  it("produces a deck that renders cleanly in headless Chrome at every step", async () => {
    const { resolveChromePath } = await import("@/lib/claude/launch");
    const html = A.assembleDeck({ runtimeCss: fs.readFileSync(path.join(dir, "deck-runtime.css"), "utf8"), runtimeJs: fs.readFileSync(path.join(dir, "deck-runtime.js"), "utf8"), title: "Orders Hub", plan, foundation: { css: "*{box-sizing:border-box}" }, slides: gen });
    expect(html).not.toContain("alert(1)");
    const views = A.verificationViews(plan, gen);
    expect(views.filter((v) => v.width === 1280 && v.theme === "light").map((v) => v.hash)).toEqual(["1.1&v=welcome", "2.1&v=overview", "2.2&v=overview", "3.1&v=orders", "3.2&v=orders", "4.1&v=play", "5.1&v=close"]);
    if (!resolveChromePath()) return;

    const decks = await import("@/lib/studio/decks");
    const { verifyDeck } = await import("@/lib/studio/verify");
    const { deck } = decks.saveDeck(1, { workspaceId: "ws_" + "0".repeat(24), title: "Orders Hub", label: "fixture", html });
    const results = [];
    for (let i = 0; i < views.length; i += 10) results.push(...(await verifyDeck(deck.id, views.slice(i, i + 10))).results);
    for (const r of results) {
      expect.soft(r.pageErrors, r.id).toEqual([]);
      expect.soft(r.consoleErrors, r.id).toEqual([]);
      expect.soft(r.blockedRequests, r.id).toEqual([]);
      expect.soft(r.issues, r.id).toEqual([]);
    }
    const at = Object.fromEntries(results.map((r) => [r.id, (r.deck as { at: number[] } | null)?.at]));
    expect(at["s3-2-orders"]).toEqual([3, 2]);
    expect(results.every((r) => r.screenshot)).toBe(true);
  }, 120_000);
});
