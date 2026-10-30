import "../app.css";
import { BrandMark } from "@/components/brand";
import { currentSession } from "@/lib/api";
import { openPending } from "@/lib/oauth/pending";

export const metadata = { title: "Connect · antm" };
export const dynamic = "force-dynamic";

/** Consent screen for the Studio connector (OAuth authorization endpoint's UI). */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ r?: string; error?: string }> }) {
  const { r, error } = await searchParams;
  const session = await currentSession();
  const pending = session && r ? openPending(r, session.userId) : null;
  const host = pending ? new URL(pending.redirectUri).host : "";

  return (
    <section className="gate" aria-labelledby="connect-h">
      <div className="gate-card">
        <BrandMark className="gate-mark" />
        {pending && session ? (
          <>
            <h1 id="connect-h">Allow {pending.clientName}?</h1>
            <p className="muted">
              <strong>{host}</strong> is asking to use antm as <span className="mono">{session.login}</span>.
            </p>
            <div className="notice" style={{ textAlign: "left" }}>
              <p className="eyebrow">It will be able to</p>
              <ul className="small" style={{ margin: ".4rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: ".3rem" }}>
                <li>List the repositories you installed the GitHub App on, and the hosts of access tokens you saved (never the tokens).</li>
                <li>Fetch a read-only copy of a repository you pick, and read its files.</li>
                <li>Save the demos you build and check them in a headless browser on this server.</li>
              </ul>
              <p className="hint">It cannot push, commit or change any repository. Claude runs in your claude.ai account, not on this server.</p>
            </div>
            <form method="post" action="/api/oauth/authorize/decision" className="row" style={{ width: "100%", justifyContent: "center" }}>
              <input type="hidden" name="r" value={r} />
              <button className="btn" name="decision" value="deny" type="submit">Cancel</button>
              <button className="btn primary lg" name="decision" value="allow" type="submit">Allow access</button>
            </form>
          </>
        ) : (
          <>
            <h1 id="connect-h">Connection request not found</h1>
            <div className="notice bad" role="alert">{error ?? "This request expired or was opened in a different browser. Start connecting again from claude.ai."}</div>
            <a className="btn ghost sm" href="/dashboard">Open the dashboard</a>
          </>
        )}
      </div>
    </section>
  );
}
