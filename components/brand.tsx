import { useId } from "react";

/** Logo: a code bracket meeting a pointer cursor on an ember tile — code that becomes interactive. */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDA635" /><stop offset=".55" stopColor="#F26A1B" /><stop offset="1" stopColor="#D4470C" />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="32" y1="0" x2="32" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".35" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#g${id})`} />
      <rect width="64" height="64" rx="18" fill={`url(#s${id})`} />
      <path d="M26 19 13 32l13 13" stroke="#FFF8F0" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M33 17.5v28.2l7.1-6.5 4.6 10.4 5.2-2.3-4.5-10.2 9.6-.5L33 17.5Z" fill="#FFF8F0" stroke="#D4470C" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
export const BRAND_NAME = "antm";
