import manifest from "@/samples/manifest.json";

export interface Sample {
  slug: string;
  title: string;
  repo: string;
  tagline: string;
  highlights: string[];
  bytes: number;
  screenshots: number;
}

const SLUG_RE = /^[a-z0-9-]{1,60}$/;
export const SAMPLES = manifest as Sample[];
export const getSample = (slug: string): Sample | undefined => (SLUG_RE.test(slug) ? SAMPLES.find((s) => s.slug === slug) : undefined);
