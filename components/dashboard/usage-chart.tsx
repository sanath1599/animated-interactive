"use client";
import { useState } from "react";

export interface DailyUsage { day: string; calls: number; estTokens: number; builds: number }

export const fmtTokens = (n: number) => (n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : `${(n / 1_000_000).toFixed(1)}M`);
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/** Estimated Claude tokens per day: a single-series bar chart with a hover tooltip and a screen-reader table. */
export function UsageChart({ daily }: { daily: DailyUsage[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 180, PAD_L = 44, PAD_B = 22, PAD_T = 8;
  const max = Math.max(1, ...daily.map((d) => d.estTokens));
  const nice = niceCeil(max);
  const n = daily.length || 1;
  const slot = (W - PAD_L) / n;
  const bw = Math.max(2, Math.min(22, slot - 2));
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const labelEvery = Math.ceil(n / 6);
  const h = hover !== null ? daily[hover] : null;

  return (
    <figure className="db-chart">
      <figcaption className="small muted">Estimated Claude tokens per day (input + output)</figcaption>
      <div className="db-chart-scroll"><div className="db-chart-wrap" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Estimated Claude tokens per day">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} className="db-grid" />
              <text x={PAD_L - 6} y={y(t) + 4} textAnchor="end" className="db-axis">{fmtTokens(t)}</text>
            </g>
          ))}
          {daily.map((d, i) => {
            const x = PAD_L + i * slot + (slot - bw) / 2;
            const top = y(d.estTokens);
            const hgt = Math.max(0, H - PAD_B - top);
            return (
              <g key={d.day}>
                {hgt > 0 && <path d={barPath(x, top, bw, hgt)} className={`db-bar ${hover === i ? "on" : ""}`} />}
                {/* Hit target: the whole column, larger than the mark. */}
                <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={H - PAD_T - PAD_B} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
                {i % labelEvery === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="db-axis">{fmtDay(d.day)}</text>}
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div className="db-tip" style={tipStyle(((PAD_L + hover * slot + slot / 2) / W) * 100)} role="status">
            <strong>{fmtDay(h.day)}</strong>
            <span>≈ {fmtTokens(h.estTokens)} tokens</span>
            <span>{h.calls} Claude call{h.calls === 1 ? "" : "s"} · {h.builds} build{h.builds === 1 ? "" : "s"}</span>
          </div>
        )}
      </div></div>
      <div className="sr-only"><table>
        <caption>Estimated Claude tokens per day</caption>
        <thead><tr><th>Day</th><th>Estimated tokens</th><th>Claude calls</th><th>Builds</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.estTokens}</td><td>{d.calls}</td><td>{d.builds}</td></tr>)}</tbody>
      </table></div>
    </figure>
  );
}

/** Keep the tooltip inside the chart near its edges. */
function tipStyle(pct: number): React.CSSProperties {
  const shift = pct > 80 ? "-100%" : pct < 20 ? "0%" : "-50%";
  return { left: `${pct}%`, transform: `translateX(${shift})` };
}

function niceCeil(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Bar with 4px rounded top corners, square at the baseline. */
function barPath(x: number, top: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`;
}
