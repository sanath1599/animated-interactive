import { describe, expect, it } from "vitest";
import { JsonlParser } from "@/lib/claude/jsonl-parser";
import { EventTranslator } from "@/lib/claude/translate";
import { canTransition, isTerminal } from "@/lib/runs/state-machine";

describe("JsonlParser", () => {
  it("handles partial chunks, CRLF, blanks and malformed lines", () => {
    const p = new JsonlParser();
    expect(p.push('{"a":1}\r\n{"b"')).toEqual([{ a: 1 }]);
    expect(p.push(':2}\n\nnot json\n{"c":3}')).toEqual([{ b: 2 }]);
    expect(p.malformed).toBe(1);
    expect(p.flush()).toEqual([{ c: 3 }]);
  });
  it("handles multibyte characters split across Buffers by string decode of whole chunks", () => {
    const p = new JsonlParser();
    expect(p.push(Buffer.from('{"t":"héllo"}\n'))).toEqual([{ t: "héllo" }]);
  });
  it("drops oversized garbage without crashing", () => {
    const p = new JsonlParser();
    p.push("x".repeat(2_100_000));
    expect(p.push('{"ok":1}\n')).toEqual([{ ok: 1 }]);
  });
});

describe("EventTranslator", () => {
  const dirs = { output: "/o", screenshots: "/s", reports: "/r" };
  const stages = (t: EventTranslator, l: Parameters<EventTranslator["handle"]>[0]) => t.handle(l).filter((e) => e.type === "stage").map((e) => (e as { stage: string }).stage);
  it("advances stages only on real signals and never backwards", () => {
    const t = new EventTranslator(dirs);
    expect(stages(t, { kind: "tool", tool: "Read", text: "r", target: "a" })).toEqual(["inspecting"]);
    expect(stages(t, { kind: "text", text: "plan" })).toEqual(["briefing"]);
    expect(stages(t, { kind: "tool", tool: "Write", text: "w", target: "/o/x.html" })).toEqual(["generating"]);
    expect(stages(t, { kind: "tool", tool: "Read", text: "r", target: "a" })).toEqual([]);
    expect(stages(t, { kind: "tool", tool: "Bash", text: "b", target: "chromium --headless" })).toEqual(["verifying"]);
  });
  it("does not treat a mere mention of chrome in a command as verification", () => {
    const t = new EventTranslator(dirs);
    expect(stages(t, { kind: "tool", tool: "Bash", text: "b", target: "grep -r chrome ./src" })).toEqual([]);
  });
  it("redacts secrets in log text and tracks permission requests", () => {
    const t = new EventTranslator(dirs);
    const ev = t.handle({ kind: "text", text: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789" });
    expect(JSON.stringify(ev)).not.toContain("ghp_");
    t.handle({ kind: "permission", requestId: "r1", tool: "Bash", summary: "x" });
    expect(t.hasPendingPermission("r1")).toBe(true);
    expect(t.resolvePermission("r1")).toBe(true);
    expect(t.resolvePermission("r1")).toBe(false);
  });
});

describe("state machine", () => {
  it("allows only legal transitions", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "succeeded")).toBe(true);
    expect(canTransition("succeeded", "running")).toBe(false);
    expect(canTransition("cancelled", "failed")).toBe(false);
    expect(canTransition("queued", "succeeded")).toBe(false);
    expect(isTerminal("interrupted")).toBe(true);
    expect(isTerminal("running")).toBe(false);
  });
});
