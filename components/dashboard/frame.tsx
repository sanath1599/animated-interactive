"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { BrandMark, BRAND_NAME } from "../brand";
import { ThemeToggle } from "../theme-toggle";
import type { DashboardData } from "./use-dashboard";

type Page = "demos" | "usage" | "setup";
const NAV: { id: Page; href: string; label: string }[] = [
  { id: "demos", href: "/dashboard", label: "Demos" },
  { id: "usage", href: "/dashboard/usage", label: "Usage" },
  { id: "setup", href: "/dashboard/setup", label: "Setup" },
];

/** Top bar shared by the signed-in pages: brand, three tabs, account. */
export function Frame({ page, data, children }: { page: Page; data: DashboardData | null; children: React.ReactNode }) {
  const router = useRouter();
  const setupDue = data ? !data.connector.connected : false;
  async function signOut() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/");
  }
  return (
    <div className="dx">
      <div className="dx-glow" aria-hidden />
      <header className="dx-top">
        <Link href="/" className="dx-brand"><BrandMark /><span>{BRAND_NAME}</span></Link>
        <nav className="dx-nav" aria-label="Dashboard">
          {NAV.map((n) => (
            <Link key={n.id} href={n.href} aria-current={page === n.id ? "page" : undefined} className={page === n.id ? "on" : ""}>
              {n.label}{n.id === "setup" && setupDue && <i className="dx-dot" aria-label="(needs attention)" />}
            </Link>
          ))}
        </nav>
        <div className="dx-acct">
          {data?.user.avatarUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="avatar" src={data.user.avatarUrl} alt="" />
            </>
          )}
          <span className="small mono dx-login">{data?.user.login}</span>
          <ThemeToggle />
          <button className="btn ghost sm" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="dx-main">{children}</main>
    </div>
  );
}

export function SignedOutGate() {
  return (
    <div className="dx"><div className="dx-glow" aria-hidden />
      <section className="gate" aria-labelledby="gate-h"><div className="gate-card">
        <BrandMark className="gate-mark" />
        <h1 id="gate-h">Turn repositories into interactive demos</h1>
        <p className="muted">Sign in with GitHub to continue. Claude runs on your own Claude plan; this site fetches the code and checks the result.</p>
        <a className="btn primary lg gate-btn" href="/api/auth/github/login?next=/dashboard">Continue with GitHub</a>
        <p className="hint">Read-only access. Nothing is ever pushed to your repositories.</p>
      </div></section>
    </div>
  );
}

export function Loading() {
  return <div className="ap-skel" aria-label="Loading"><i /><i /></div>;
}
