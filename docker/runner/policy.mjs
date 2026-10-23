// Tool-permission policy for the agent run. Pure functions so they can be unit tested.
import path from "node:path";

// Protected locations, matched as path segments so ordinary files such as tailwind.config.ts are unaffected.
const FORBIDDEN = /(^|[\s"'=:\/])\.(claude|ssh|aws|gnupg|npmrc|netrc|git-credentials)(\/|$|[\s"'])|\/proc\/|\/etc\/|\/root(\/|$|\s)|\/home\/(?!runner\/work)|~|\$HOME|\.env(?!\.(example|sample|template))(\.|\b)/i;
const READ_ONLY_CMDS = new Set(["ls", "wc", "head", "tail", "file", "du", "pwd", "stat", "cat", "grep", "egrep", "sort", "uniq", "cut", "tr", "basename", "dirname", "base64", "nl", "tree"]);
const DENIED_CMDS = new Set(["printenv", "env", "set", "export", "declare", "sudo", "su", "ssh", "scp", "nc", "ncat", "telnet"]);
const CHROME_CMDS = new Set(["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]);

export function insideAny(p, roots) {
  const abs = path.resolve(p);
  return roots.some((r) => abs === r || abs.startsWith(r.endsWith(path.sep) ? r : r + path.sep));
}

export function tokenize(cmd) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/**
 * Splits a command on unquoted `&&`, `;` and `|`. Returns null when it contains anything that could
 * redirect, substitute or background (unquoted `>` `<` `` ` `` `$(` `&` newline, or `$(`/backtick inside double quotes).
 */
export function splitCommand(cmd) {
  const parts = [];
  let cur = "";
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { cur += c; if (c === "'") q = null; continue; }
    if (q === '"') {
      if (c === "`" || (c === "$" && /[({]/.test(cmd[i + 1] ?? ""))) return null;
      if (c === "\\") { cur += c + (cmd[++i] ?? ""); continue; }
      cur += c; if (c === '"') q = null; continue;
    }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "&" && cmd[i + 1] === "&") { parts.push(cur); cur = ""; i++; continue; }
    if (c === ";" || c === "|") { if (c === "|" && cmd[i + 1] === "|") return null; parts.push(cur); cur = ""; continue; }
    if ("&><`\n\r\\(){}".includes(c) || (c === "$" && /[({]/.test(cmd[i + 1] ?? ""))) return null;
    cur += c;
  }
  if (q) return null;
  parts.push(cur);
  return parts.map((x) => x.trim()).filter(Boolean);
}

function classifyOne(command, { readRoots, writeRoots, chromePath }) {
  const argv = tokenize(command);
  const bin = path.basename(argv[0] ?? "");
  const args = argv.slice(1);
  const allRoots = [...readRoots, ...writeRoots];
  if (DENIED_CMDS.has(bin)) return { decision: "deny", reason: `${bin} is not permitted` };
  if (args.some((a) => /(^|\/)\.\.(\/|$)/.test(a))) return { decision: "deny", reason: "Parent-directory paths are not allowed" };
  const fileArgs = args.filter((a) => a.startsWith("/") || a.startsWith("file://")).map((a) => a.replace(/^file:\/\//, ""));
  // Option values like --screenshot=/x are checked below; plain absolute paths must be inside the run folders.
  if (fileArgs.some((p) => !insideAny(p, allRoots)) && !CHROME_CMDS.has(bin) && !(chromePath && argv[0] === chromePath) && !/chrome/i.test(bin)) {
    return { decision: "deny", reason: "Path outside the run workspace" };
  }
  if (READ_ONLY_CMDS.has(bin)) return { decision: "allow" };
  if (bin === "sed") {
    const script = args.find((a) => !a.startsWith("-"));
    return args.includes("-n") && !args.some((a) => /^-[a-z]*i/.test(a)) && script && /^[0-9,$]+p$/.test(script)
      ? { decision: "allow" }
      : { decision: "ask", reason: "sed is limited to printing line ranges (sed -n 'N,Mp')" };
  }
  if (bin === "find") {
    return args.some((a) => /^-(exec|execdir|ok|okdir|delete|fprint|fprintf|fls)/.test(a))
      ? { decision: "ask", reason: "find with actions is not on the pre-approved list" }
      : { decision: "allow" };
  }
  if (bin === "cd") return args.length === 1 && (!args[0].startsWith("/") || insideAny(args[0], allRoots)) ? { decision: "allow" } : { decision: "deny", reason: "cd target outside the run workspace" };
  if (bin === "mkdir") {
    const targets = args.filter((a) => !a.startsWith("-"));
    return targets.length > 0 && targets.every((t) => t.startsWith("/") && insideAny(t, writeRoots))
      ? { decision: "allow" }
      : { decision: "deny", reason: "mkdir is limited to the output, screenshots and reports folders" };
  }
  const isChrome = CHROME_CMDS.has(bin) || (chromePath && argv[0] === chromePath) || /chrome/i.test(bin);
  if (isChrome && argv.some((a) => a.startsWith("--headless"))) {
    if (argv.some((a) => /^--(remote-debugging|user-data-dir=\/(?!tmp))/.test(a))) return { decision: "ask", reason: "Chrome with debugging or custom profile flags" };
    const screenshot = argv.find((a) => a.startsWith("--screenshot="));
    if (screenshot && !insideAny(screenshot.slice("--screenshot=".length), writeRoots)) return { decision: "deny", reason: "Screenshot path outside permitted directories" };
    const urls = args.filter((a) => /^(https?|ftp):\/\//i.test(a));
    if (urls.length) return { decision: "deny", reason: "Headless Chrome may only open local files" };
    if (fileArgs.some((p) => !insideAny(p, allRoots) && p !== screenshot?.slice("--screenshot=".length))) return { decision: "deny", reason: "Path outside the run workspace" };
    return { decision: "allow" };
  }
  return { decision: "ask", reason: `Command "${bin}" is not on the pre-approved list` };
}

/** @returns {{decision:'allow'|'deny'|'ask', reason?:string}} */
export function classifyBash(command, ctx) {
  if (typeof command !== "string" || !command.trim()) return { decision: "deny", reason: "Empty command" };
  if (FORBIDDEN.test(command)) return { decision: "deny", reason: "Command references a protected location" };
  const parts = splitCommand(command);
  if (!parts || parts.length === 0) return { decision: "ask", reason: "Command uses shell operators" };
  const results = parts.map((x) => classifyOne(x, ctx));
  const denied = results.find((r) => r.decision === "deny");
  if (denied) return denied;
  return results.every((r) => r.decision === "allow") ? { decision: "allow" } : results.find((r) => r.decision === "ask");
}

/** Decide on any tool call. Returns {decision, reason}. */
export function decideTool(tool, input, ctx) {
  const { readRoots, writeRoots } = ctx;
  switch (tool) {
    case "Read":
    case "Glob":
    case "Grep": {
      const p = input.file_path ?? input.path ?? ctx.cwd;
      return insideAny(String(p), [...readRoots, ...writeRoots])
        ? { decision: "allow" }
        : { decision: "deny", reason: "Reads are limited to the run workspace" };
    }
    case "Write":
    case "Edit":
    case "MultiEdit": {
      const p = input.file_path;
      return p && insideAny(String(p), writeRoots)
        ? { decision: "allow" }
        : { decision: "deny", reason: "Writes are limited to the output, screenshots and reports folders" };
    }
    case "TodoWrite":
      return { decision: "allow" };
    case "Bash":
      return classifyBash(input.command, ctx);
    default:
      return { decision: "deny", reason: `Tool ${tool} is not permitted in Demo Studio runs` };
  }
}

/** Short, secret-free description of a tool call for the progress log. */
export function describeTool(tool, input) {
  const p = (v) => (typeof v === "string" ? v : "");
  const base = (v) => path.basename(p(v)) || p(v);
  switch (tool) {
    case "Read": return `Reading ${base(input.file_path)}`;
    case "Glob": return `Searching for files matching ${p(input.pattern).slice(0, 60)}`;
    case "Grep": return `Searching code for ${p(input.pattern).slice(0, 60)}`;
    case "Write": return `Writing ${base(input.file_path)}`;
    case "Edit":
    case "MultiEdit": return `Editing ${base(input.file_path)}`;
    case "Bash": return `Running a command: ${p(input.command).split(/\s+/)[0]}`;
    case "TodoWrite": return "Updating plan";
    default: return `Using ${tool}`;
  }
}
