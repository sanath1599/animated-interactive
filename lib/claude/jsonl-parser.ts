/** Incremental JSONL parser: tolerant of partial chunks, CRLF, blank and malformed lines. */
export class JsonlParser {
  private buf = "";
  private static MAX_LINE = 2_000_000;
  malformed = 0;

  push(chunk: Buffer | string): unknown[] {
    this.buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const out: unknown[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).replace(/\r$/, "");
      this.buf = this.buf.slice(nl + 1);
      this.parseLine(line, out);
    }
    if (this.buf.length > JsonlParser.MAX_LINE) { this.buf = ""; this.malformed++; }
    return out;
  }

  flush(): unknown[] {
    const out: unknown[] = [];
    this.parseLine(this.buf.replace(/\r$/, ""), out);
    this.buf = "";
    return out;
  }

  private parseLine(line: string, out: unknown[]) {
    if (!line.trim()) return;
    try { out.push(JSON.parse(line)); } catch { this.malformed++; }
  }
}
