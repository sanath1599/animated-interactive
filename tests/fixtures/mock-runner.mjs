// TEST ONLY. Emulates the runner-entry JSONL protocol; it does not call Claude.
import fs from "node:fs";
import path from "node:path";

const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const scenario = process.env.MOCK_SCENARIO ?? "success";
const out = process.env.DS_OUTPUT_DIR, shots = process.env.DS_SCREENSHOTS_DIR, reports = process.env.DS_REPORTS_DIR;

emit({ kind: "started" });
emit({ kind: "tool", tool: "Read", text: "Reading package.json", target: "package.json" });
if (scenario === "hang") { process.on("SIGTERM", () => process.exit(143)); setInterval(() => {}, 1000); }
else {
  emit({ kind: "text", text: "Planning slides" });
  if (scenario === "fail") { emit({ kind: "done", ok: false, error: "mock failure" }); process.exit(1); }
  emit({ kind: "tool", tool: "Write", text: "Writing demo.html", target: path.join(out, "demo.html") });
  fs.writeFileSync(path.join(out, "demo.html"), scenario === "external" ? '<html><script src="https://cdn.example.com/x.js"></script></html>' : "<html><body>demo</body></html>");
  if (scenario !== "partial") {
    emit({ kind: "tool", tool: "Bash", text: "Running a command: chromium", target: "chromium --headless" });
    fs.writeFileSync(path.join(shots, "slide-1.png"), "png");
    fs.writeFileSync(path.join(reports, "verification-report.md"), "# Verification\n- NOT RUN: everything (mock)\n");
    fs.writeFileSync(path.join(reports, "evidence-report.md"), "# Evidence\nmock\n");
  }
  emit({ kind: "result", ok: true, turns: 3 });
  emit({ kind: "done", ok: true });
  process.exit(scenario === "partial-fail" ? 1 : 0);
}
