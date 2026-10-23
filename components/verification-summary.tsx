import { fmtBytes } from "@/lib/client";

export interface Checks {
  htmlExists: boolean; htmlFile: string | null; htmlBytes: number; underSizeTarget: boolean;
  externalReferences: string[]; screenshotCount: number; verificationReportPresent: boolean; evidenceReportPresent: boolean; fullyDocumented: boolean;
}

export function VerificationSummary({ checks }: { checks: Checks | null }) {
  if (!checks) return <div className="notice">No verification data was recorded for this run.</div>;
  const row = (label: string, ok: boolean, detail?: string) => (
    <li className="row spread" style={{ padding: ".3rem 0" }}>
      <span>{label}{detail && <span className="muted small"> · {detail}</span>}</span>
      <span className={`chip ${ok ? "ok" : "warn"}`}>{ok ? "passed" : "not confirmed"}</span>
    </li>
  );
  return (
    <div className="stack">
      <div className={`notice ${checks.fullyDocumented ? "" : "warn"}`}>
        {checks.fullyDocumented
          ? "All evidence artifacts were produced. The agent's own check results are in the verification report."
          : "Verification is incomplete. Items marked “not confirmed” were not produced or could not be checked. Review the report before sharing."}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {row("Presentation file exists", checks.htmlExists, fmtBytes(checks.htmlBytes))}
        {row("Self-contained (no external resources)", checks.externalReferences.length === 0, checks.externalReferences.length ? `${checks.externalReferences.length} external reference(s)` : undefined)}
        {row("Screenshots captured", checks.screenshotCount > 0, `${checks.screenshotCount}`)}
        {row("Verification report written", checks.verificationReportPresent)}
        {row("Evidence & caveats report written", checks.evidenceReportPresent)}
      </ul>
      <p className="hint">These server-side checks confirm files exist and scan the HTML for external references. They do not re-run the browser tests.</p>
    </div>
  );
}
