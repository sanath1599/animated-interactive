// Inlines the builder's scripts and the deck runtime into one page for publishing as a claude.ai artifact.
// Usage: node artifact/build.mjs [APP_URL] [OUT_FILE]   → artifact/dist/index.html by default
import fs from "node:fs";
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const appUrl = (process.argv[2] || process.env.APP_URL || "https://app.antm.ai").replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(appUrl)) throw new Error(`APP_URL must be an https origin, got ${appUrl}`);
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
// "<!--" or "<script" inside an inline script can switch the HTML parser into its escaped states, so
// the closing tag would be missed. "\x3C" is "<" in both JS strings and regex literals.
const inlineJs = (s) => s.replace(/<(\/?script|!--)/gi, "\\x3C$1");
const json = (s) => JSON.stringify(s).replace(/</g, "\\u003c");

const scripts = [
  `window.__APP_URL=${json(appUrl)};window.__DECK_RUNTIME_CSS=${json(read("deck-runtime.css"))};window.__DECK_RUNTIME_JS=${json(read("deck-runtime.js"))};`,
  read("deck-assembler.js"),
  read("prompts.js"),
  read("builder.js"),
].map((s) => `<script>\n${inlineJs(s)}\n</script>`).join("\n");

const page = read("index.html").replace("<!--INLINE-->", scripts);
const out = path.resolve(process.argv[3] || path.join(dir, "dist", "index.html"));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`${out} (${(Buffer.byteLength(page) / 1024).toFixed(1)} KB) for ${appUrl}`);
