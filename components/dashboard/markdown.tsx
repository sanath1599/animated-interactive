import type { ReactNode } from "react";

/**
 * Renders the Markdown the builders write for their reports: headings, paragraphs, bullet lists, tables,
 * fenced code, **bold**, `code` and [links](https://…). Builds React elements, never raw HTML, so a report
 * can't inject markup into the dashboard.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  const key = () => out.length;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      i++;
      out.push(<pre key={key()}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const Tag = (["h2", "h3", "h4", "h5"] as const)[h[1].length - 1];
      out.push(<Tag key={key()}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (line.trimStart().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].trimStart().startsWith("|"); i++) rows.push(cells(lines[i]));
      out.push(
        <div className="md-table" key={key()}>
          <table>
            <thead><tr>{head.map((c, k) => <th key={k}>{inline(c)}</th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k}>{head.map((_, j) => <td key={j}>{cell(r[j] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*]\s+/.test(lines[i]); i++) items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
      out.push(<ul key={key()}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\|)/.test(lines[i]); i++) para.push(lines[i]);
    if (!para.length) para.push(lines[i++]);
    out.push(<p key={key()}>{inline(para.join(" "))}</p>);
  }
  return <div className="md">{out}</div>;
}

// The reports' check results read at a glance as status chips.
const STATUS: Record<string, string> = { PASSED: "ok", FAILED: "bad", "NOT RUN": "" };
const cell = (c: string) => (Object.hasOwn(STATUS, c) ? <span className={`chip ${STATUS[c]}`}>{c.toLowerCase()}</span> : inline(c));

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function inline(s: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    if (m[1] !== undefined) parts.push(<code key={m.index}>{m[1]}</code>);
    else if (m[2] !== undefined) parts.push(<strong key={m.index}>{m[2]}</strong>);
    else parts.push(<a key={m.index} href={m[4]} target="_blank" rel="noreferrer">{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}
