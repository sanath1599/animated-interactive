import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function tempDataDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ds-test-"));
  process.env.DATA_DIR = d;
  return d;
}
