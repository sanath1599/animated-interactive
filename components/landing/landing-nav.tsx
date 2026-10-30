import Link from "next/link";
import { BrandMark, BRAND_NAME } from "@/components/brand";
import { SocialLinks } from "@/components/social";
import { ThemeToggle } from "@/components/theme-toggle";

export function LandingNav() {
  return (
    <header className="ln">
      <div className="ln-in">
        <Link href="/" className="brand"><BrandMark /><span className="brand-text">{BRAND_NAME}</span></Link>
        <nav className="ln-links" aria-label="Sections">
          <Link href="/samples">Samples</Link><Link href="/#how">How it works</Link><Link href="/#security">Security</Link><Link href="/#faq">FAQ</Link>
        </nav>
        <div className="ln-end">
          <SocialLinks />
          <ThemeToggle />
          <Link href="/dashboard" className="ln-signin">Sign in</Link>
          <Link href="/dashboard" className="btn primary sm">Build a demo</Link>
        </div>
      </div>
    </header>
  );
}
