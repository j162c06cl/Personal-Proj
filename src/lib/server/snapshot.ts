// Saved market data used when the live provider fails (or when DATA_MODE=snapshot).
// Built by `npm run snapshot`. Values keep their original provider timestamp, and the
// source label says "Saved snapshot", so the UI never presents old data as live.
import quotes from "@/data/snapshot/quotes.json";
import market from "@/data/snapshot/market.json";
import charts from "@/data/snapshot/charts.json";
import fundamentals from "@/data/snapshot/fundamentals.json";
import news from "@/data/snapshot/news.json";

/** Set DATA_MODE=snapshot to serve only saved data, e.g. for a demo that must not depend on Yahoo. */
export const forceSnapshot = process.env.DATA_MODE === "snapshot";

type WithSource = { source?: string | null };

function label<T extends WithSource>(d: T | undefined): T | null {
  if (!d) return null;
  return { ...d, source: `Saved snapshot (${d.source ?? "Yahoo Finance"})` };
}

export function snapshotQuote(ticker: string) {
  return label((quotes as Record<string, WithSource>)[ticker]);
}

export function snapshotMarket() {
  const m = market as { indices?: WithSource[]; lastUpdated?: string };
  if (!m.indices) return null;
  return { indices: m.indices.map((x) => label(x)), lastUpdated: m.lastUpdated };
}

export function snapshotChart(ticker: string, range: string) {
  const c = (charts as Record<string, Record<string, WithSource & { points?: { t: string }[] }>>)[ticker];
  if (!c) return null;
  if (c[range]) return label(c[range]);
  // Shorter daily ranges are a slice of the saved 2-year series
  const months: Record<string, number> = { "1mo": 1, "3mo": 3, "6mo": 6, "1y": 12 };
  if (c["2y"] && months[range]) {
    const last = c["2y"].points?.at(-1)?.t;
    if (!last) return null;
    const cut = new Date(last + "T00:00:00Z");
    cut.setUTCMonth(cut.getUTCMonth() - months[range]);
    const from = cut.toISOString().slice(0, 10);
    return label({ ...c["2y"], range, points: c["2y"].points?.filter((p) => p.t >= from) });
  }
  return null;
}

export function snapshotFundamentals(ticker: string) {
  return label((fundamentals as Record<string, WithSource>)[ticker]);
}

export function snapshotNews(ticker: string) {
  return label((news as Record<string, WithSource>)[ticker]);
}
