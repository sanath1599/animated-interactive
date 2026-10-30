"use client";
import { useEffect, useState } from "react";
import { Toaster as SileoToaster } from "sileo";
import "sileo/styles.css";

type Theme = "light" | "dark";
const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** Toasts for one-off results (saved, deleted, copied, connected). Follows the site's theme toggle. */
export function Toaster() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    // The theme lives on <html data-theme>, set before paint and flipped by the toggle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current());
    const mo = new MutationObserver(() => setTheme(current()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return <SileoToaster position="bottom-right" theme={theme} />;
}
