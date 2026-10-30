"use client";
import { useState } from "react";
import { Frame, Loading, SignedOutGate } from "./frame";
import { UsageChart, fmtTokens } from "./usage-chart";
import { ago, dur, useDashboard, type Usage as UsageData } from "./use-dashboard";

/** Builds and estimated assistant usage over 7/30/90 days; admins can switch to everyone on the server. */
export function Usage() {
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState<"me" | "all">("me");
  const { data, signedOut, error } = useDashboard({ days, scope });
  if (signedOut) return <SignedOutGate />;
  const u = data?.usage;

  return (
    <Frame page="usage" data={data}>
      <section className="dx-hero dx-hero-row">
        <div>
          <h1>{data?.scope === "all" ? `Everyone, last ${days} days` : `Your builds, last ${days} days`}</h1>
          <p className="dx-lede">Token counts are estimates from what was sent and received. Claude and ChatGPT show your actual plan usage.</p>
        </div>
        <div className="row">
          {data?.user.admin && (
            <div className="db-seg" role="group" aria-label="Whose usage">
              {(["me", "all"] as const).map((s) => <button key={s} type="button" className={scope === s ? "on" : ""} aria-pressed={scope === s} onClick={() => setScope(s)}>{s === "me" ? "Me" : "All users"}</button>)}
            </div>
          )}
          <div className="db-seg" role="group" aria-label="Date range">
            {[7, 30, 90].map((d) => <button key={d} type="button" className={days === d ? "on" : ""} aria-pressed={days === d} onClick={() => setDays(d)}>{d}d</button>)}
          </div>
        </div>
      </section>
      {error && <div className="notice bad" role="alert">{error}</div>}

      {!u ? <Loading /> : (
        <>
          <div className="db-tiles">
            <Tile label="Demos built" value={String(u.generations.completed)} sub={`${u.generations.total} started${u.generations.running ? ` · ${u.generations.running} running` : ""}`} />
            <Tile label="Success rate" value={finished(u) ? `${Math.round((u.generations.completed / finished(u)) * 100)}%` : "–"} sub={`${u.generations.failed + u.generations.interrupted} failed or interrupted`} />
            <Tile label="Assistant steps" value={String(u.claude.calls)} sub={u.claude.failedCalls ? `${u.claude.failedCalls} failed` : "none failed"} />
            <Tile label="Est. tokens" value={`≈ ${fmtTokens(u.claude.estInputTokens + u.claude.estOutputTokens)}`} sub={`${fmtTokens(u.claude.estInputTokens)} in · ${fmtTokens(u.claude.estOutputTokens)} out`} />
            <Tile label="Assistant time" value={u.claude.ms ? dur(u.claude.ms) : "–"} sub={u.avgBuildMs ? `${dur(u.avgBuildMs)} per finished build` : "no finished builds"} />
          </div>

          <section className="dx-panel-open">
            {u.claude.calls > 0 ? <UsageChart daily={u.daily} /> : <p className="small muted">Nothing in this period yet. Usage appears here as soon as a build starts.</p>}
          </section>

          {u.stages.length > 0 && (
            <section className="dx-panel-open">
              <h2 className="dx-h2">Where the tokens went</h2>
              <table className="db-table">
                <thead><tr><th>Step</th><th className="num">Calls</th><th className="num">≈ Tokens</th><th className="num">Time</th></tr></thead>
                <tbody>{u.stages.map((s) => <tr key={s.stage}><td>{s.stage}</td><td className="num">{s.calls}</td><td className="num">{fmtTokens(s.estTokens)}</td><td className="num">{dur(s.ms)}</td></tr>)}</tbody>
              </table>
            </section>
          )}

          {u.users && u.users.length > 0 && (
            <section className="dx-panel-open">
              <h2 className="dx-h2">Users <span className="muted small">{u.users.length}</span></h2>
              <div className="dx-scroll">
                <table className="db-table">
                  <thead><tr><th>User</th><th className="num">Builds</th><th className="num">Finished</th><th className="num">Assistant steps</th><th className="num">≈ Tokens</th><th>Last active</th></tr></thead>
                  <tbody>{u.users.map((x) => <tr key={x.login}><td className="mono">{x.login}</td><td className="num">{x.builds}</td><td className="num">{x.completed}</td><td className="num">{x.calls}</td><td className="num">{fmtTokens(x.estTokens)}</td><td>{x.lastActive ? ago(x.lastActive) : "–"}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </Frame>
  );
}

const finished = (u: UsageData) => u.generations.completed + u.generations.failed + u.generations.interrupted;

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="db-tile">
      <span className="small muted">{label}</span>
      <strong className="db-tile-v">{value}</strong>
      <span className="small muted">{sub}</span>
    </div>
  );
}
