const PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(authorization:\s*(?:bearer|token|basic)\s+)[^\s"']+/gi,
  /(https?:\/\/)[^/\s:@]+:[^/\s@]+@/g,
  /((?:api[_-]?key|secret|token|password|passwd)["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi,
];

export function redact(text: string): string {
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, (m, g1) => (typeof g1 === "string" && g1 ? `${g1}[REDACTED]` : "[REDACTED]"));
  }
  return out;
}
