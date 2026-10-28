import { redirect } from "next/navigation";

/** Connector setup moved to the dashboard; keep old links (and deck links already saved in claude.ai) working. */
export default async function ConnectorPage({ searchParams }: { searchParams: Promise<{ deck?: string }> }) {
  const { deck } = await searchParams;
  redirect(deck && /^deck_[a-f0-9]{24}$/.test(deck) ? `/dashboard?deck=${deck}` : "/dashboard");
}
