// Portfolio value over time, rebuilt from each holding's purchase date and its price history.
import { ChartRange, PortfolioPosition } from "./types";

export interface GrowthPoint {
  t: string;        // YYYY-MM-DD
  value: number;    // market value of everything held on that date (USD)
  invested: number; // cost of everything held on that date (USD)
}

type Position = Pick<PortfolioPosition, "ticker" | "quantity" | "purchasePrice" | "purchaseDate">;

/**
 * One point per trading date found in `prices`. A position counts from its purchase date
 * onward, valued at the latest close on or before each date (or its purchase price until
 * the first close is known). `latest` adds a final point for `today` from live quotes.
 */
export function buildGrowthSeries(
  positions: Position[],
  prices: Record<string, { t: string; c: number }[]>,
  opts: { latest?: Record<string, number | null>; today?: string } = {}
): GrowthPoint[] {
  if (!positions.length) return [];
  const firstBuy = positions.reduce((m, p) => (p.purchaseDate < m ? p.purchaseDate : m), positions[0].purchaseDate);

  const dates = Array.from(new Set(Object.values(prices).flatMap((s) => s.map((p) => p.t))))
    .filter((t) => t >= firstBuy)
    .sort();
  if (opts.today && opts.latest && (!dates.length || opts.today > dates[dates.length - 1])) dates.push(opts.today);

  const series = Object.fromEntries(Object.entries(prices).map(([t, s]) => [t, [...s].sort((a, b) => a.t.localeCompare(b.t))]));
  const cursor: Record<string, number> = {};
  const last: Record<string, number> = {};

  return dates.map((d) => {
    for (const [ticker, s] of Object.entries(series)) {
      let i = cursor[ticker] ?? 0;
      while (i < s.length && s[i].t <= d) last[ticker] = s[i++].c;
      cursor[ticker] = i;
    }
    if (d === opts.today && opts.latest) {
      for (const [ticker, price] of Object.entries(opts.latest)) if (price != null) last[ticker] = price;
    }
    let value = 0, invested = 0;
    for (const p of positions) {
      if (p.purchaseDate > d) continue;
      value += p.quantity * (last[p.ticker] ?? p.purchasePrice);
      invested += p.quantity * p.purchasePrice;
    }
    return { t: d, value, invested };
  });
}

/** Gain over the period with new money removed, so buying more doesn't look like growth */
export function periodGain(points: GrowthPoint[]): number | null {
  if (points.length < 2) return null;
  const a = points[0], b = points[points.length - 1];
  return b.value - a.value - (b.invested - a.invested);
}

/** Shortest chart range that reaches back to `since` (capped at 5 years) */
export function rangeCovering(since: string, now = new Date()): ChartRange {
  const months = (now.getTime() - new Date(since + "T00:00:00").getTime()) / (30.44 * 86_400_000);
  if (months <= 1) return "1mo";
  if (months <= 3) return "3mo";
  if (months <= 6) return "6mo";
  if (months <= 12) return "1y";
  if (months <= 24) return "2y";
  return "5y";
}
