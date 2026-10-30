import type { Metadata } from "next";
import { Geist, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-src" });

export const metadata: Metadata = {
  title: "antm · interactive demos from your code",
  description: "Turn a repository into an interactive, click-through demo with Claude or ChatGPT. Read-only access, every slide checked in a real browser.",
};

// Applies the saved (or system) theme before first paint to avoid a flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem('ati-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>{children}</body>
    </html>
  );
}
