import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRunSchema, validateUpload } from "@/lib/validation/schemas";
import { isBranchName, isRunId, newRunId, parseRepoRef, resolveInside, safeFilename, slugify } from "@/lib/security/ids";
import { redact } from "@/lib/security/redact";

const base = { owner: "acme", repo: "app", installationId: 5 };

describe("run form validation", () => {
  it("requires a title", () => {
    expect(createRunSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(createRunSchema.safeParse({ ...base }).success).toBe(false);
  });
  it("accepts a minimal request: details and data are optional", () => {
    const r = createRunSchema.safeParse({ ...base, title: "My Demo" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.details).toBe("");
  });
  it("rejects multi-line titles and bad identifiers", () => {
    expect(createRunSchema.safeParse({ ...base, title: "a\nb" }).success).toBe(false);
    expect(createRunSchema.safeParse({ ...base, owner: "a/b", title: "x" }).success).toBe(false);
    expect(createRunSchema.safeParse({ ...base, repo: "..", title: "x" }).success).toBe(false);
    expect(createRunSchema.safeParse({ ...base, branch: "--upload-pack=evil", title: "x" }).success).toBe(false);
    expect(createRunSchema.safeParse({ ...base, branch: "a/../b", title: "x" }).success).toBe(false);
  });
});

describe("identifiers", () => {
  it("validates run ids", () => {
    expect(isRunId(newRunId())).toBe(true);
    expect(isRunId("../etc")).toBe(false);
    expect(isRunId("run_" + "g".repeat(24))).toBe(false);
  });
  it("parses repo references", () => {
    expect(parseRepoRef("https://github.com/acme/app.git")).toEqual({ owner: "acme", repo: "app" });
    expect(parseRepoRef("acme/app")).toEqual({ owner: "acme", repo: "app" });
    expect(parseRepoRef("https://evil.com/acme/app")).toBeNull();
    expect(parseRepoRef("acme/../x")).toBeNull();
  });
  it("accepts normal branches only", () => {
    for (const b of ["main", "feature/x-1", "release_1.2"]) expect(isBranchName(b)).toBe(true);
    for (const b of ["-x", "a..b", "a//b", "a b", "x.lock", "/a"]) expect(isBranchName(b)).toBe(false);
  });
  it("sanitises file names and slugs", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\x\\..\\y.csv")).toBe("y.csv");
    expect(safeFilename("..hidden")).toBe("hidden");
    expect(slugify("Acme: Q3 Results!")).toBe("acme-q3-results");
    expect(slugify("!!!")).toBe("demo");
  });
});

describe("resolveInside", () => {
  it("blocks traversal and symlink escapes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ri-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "out-"));
    fs.writeFileSync(path.join(outside, "s"), "x");
    fs.symlinkSync(outside, path.join(root, "link"));
    expect(() => resolveInside(root, "../x")).toThrow();
    expect(() => resolveInside(root, "link", "s")).toThrow();
    expect(resolveInside(root, "ok.txt")).toBe(path.join(fs.realpathSync(root), "ok.txt"));
  });
});

describe("upload validation", () => {
  const max = 1024 * 1024;
  it("accepts good files", () => {
    expect(validateUpload("a.csv", Buffer.from("a,b\n1,2"), max).ok).toBe(true);
    expect(validateUpload("a.json", Buffer.from('{"a":1}'), max).ok).toBe(true);
    expect(validateUpload("a.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]), max).ok).toBe(true);
  });
  it("rejects bad type, size, empty, spoofed and invalid content", () => {
    expect(validateUpload("a.exe", Buffer.from("x"), max).ok).toBe(false);
    expect(validateUpload("a.csv", Buffer.alloc(max + 1, 97), max).ok).toBe(false);
    expect(validateUpload("a.csv", Buffer.alloc(0), max).ok).toBe(false);
    expect(validateUpload("a.png", Buffer.from("<html>"), max).ok).toBe(false);
    expect(validateUpload("a.json", Buffer.from("{bad"), max).ok).toBe(false);
    expect(validateUpload("a.txt", Buffer.from([0x61, 0, 0x62]), max).ok).toBe(false);
  });
});

describe("redaction", () => {
  it("masks tokens and credentials in URLs", () => {
    const out = redact("token ghp_abcdefghijklmnopqrstuvwxyz0123456789 and https://user:pw@github.com/x and sk-ant-abcdefghij123 Authorization: Bearer abc.def");
    expect(out).not.toMatch(/ghp_|user:pw|sk-ant|abc\.def/);
  });
});
