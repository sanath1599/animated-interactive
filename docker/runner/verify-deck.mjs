// Renders a generated deck in headless Chromium and reports what a reviewer would check:
// console and page errors, blocked network requests, clipping/overflow, and a screenshot per view.
// Runs inside the runner container (no network) or locally in dev. Input: VERIFY_SPEC=<spec.json>.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const spec = JSON.parse(fs.readFileSync(process.env.VERIFY_SPEC, "utf8"));
const deadline = Date.now() + (spec.budgetMs ?? 100_000);
const fileUrl = "file://" + path.resolve(spec.html);
const results = [];

const browser = await puppeteer.launch({
  executablePath: spec.chrome || process.env.CHROME_PATH,
  headless: true,
  args: ["--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none", ...(spec.noSandbox ? ["--no-sandbox"] : [])],
});

try {
  for (const v of spec.views) {
    if (Date.now() > deadline) { results.push({ id: v.id, skipped: "time budget reached" }); continue; }
    const r = { id: v.id, hash: v.hash, width: v.width, height: v.height, theme: v.theme ?? "light", consoleErrors: [], pageErrors: [], blockedRequests: [], issues: [], deck: null, screenshot: null };
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: v.width, height: v.height, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([
        { name: "prefers-reduced-motion", value: "reduce" },
        { name: "prefers-color-scheme", value: v.theme === "dark" ? "dark" : "light" },
      ]);
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const u = req.url();
        if (/^(file|data|blob|about):/.test(u)) return void req.continue();
        r.blockedRequests.push(u.slice(0, 200));
        void req.abort();
      });
      page.on("console", (m) => { if (m.type() === "error") r.consoleErrors.push(m.text().slice(0, 300)); });
      page.on("pageerror", (e) => r.pageErrors.push(String(e?.message ?? e).slice(0, 300)));
      await page.goto(`${fileUrl}#${v.hash}`, { waitUntil: "load", timeout: 15_000 });
      await page.waitForFunction("window.__deck && window.__deck.ready === true", { timeout: 5000 }).catch(() => r.issues.push("The deck engine did not report ready within 5 s."));
      await new Promise((res) => setTimeout(res, 450));
      r.deck = await page.evaluate(() => {
        const d = window.__deck;
        const doc = document.documentElement;
        return {
          at: d?.position?.() ?? null,
          check: d?.check?.() ?? null,
          horizontalOverflow: doc.scrollWidth > window.innerWidth + 1,
        };
      });
      if (r.deck?.horizontalOverflow) r.issues.push("The page scrolls horizontally at this width.");
      for (const c of r.deck?.check?.clipped ?? []) r.issues.push(`Clipped text: ${c}`);
      for (const c of r.deck?.check?.outside ?? []) r.issues.push(`Outside the stage: ${c}`);
      const shot = path.join(spec.outDir, `${v.id}.jpg`);
      await page.screenshot({ path: shot, type: "jpeg", quality: 72 });
      r.screenshot = path.basename(shot);
    } catch (e) {
      r.issues.push(`Render failed: ${String(e?.message ?? e).slice(0, 200)}`);
    } finally {
      await page.close().catch(() => {});
    }
    results.push(r);
  }
} finally {
  await browser.close().catch(() => {});
}

fs.writeFileSync(path.join(spec.outDir, "results.json"), JSON.stringify({ ok: true, results }, null, 2));
