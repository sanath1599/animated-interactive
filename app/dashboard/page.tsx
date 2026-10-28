import "../app.css";
import { Demos } from "@/components/dashboard/demos";

export const metadata = { title: "Demos · Animated Technical Interactive" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ deck?: string }> }) {
  const { deck } = await searchParams;
  return <Demos focusDeck={deck && /^deck_[a-f0-9]{24}$/.test(deck) ? deck : undefined} />;
}
