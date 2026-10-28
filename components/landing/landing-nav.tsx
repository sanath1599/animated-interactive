import Link from "next/link";
import { BrandMark, BRAND_NAME } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function LandingNav() {
  return (
    <header className="ln">
      <div className="ln-in">
        <Link href="/" className="brand"><BrandMark /><span className="brand-text">{BRAND_NAME}</span></Link>
        <nav className="ln-links" aria-label="Sections">
          <Link href="/#features">Features</Link><Link href="/#product">Product</Link><Link href="/samples">Samples</Link><Link href="/#how">How it works</Link><Link href="/#trust">Safety</Link><Link href="/#faq">FAQ</Link>
        </nav>
        <div className="row" style={{ gap: ".5rem" }}>
          <ThemeToggle />
          <Link href="/dashboard" className="btn primary sm">Get started</Link>
        </div>
      </div>
    </header>
  );
}
