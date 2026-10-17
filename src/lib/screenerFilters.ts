// Screener filters, grouped by the strategy they belong to. Each filter pairs its test with
// the sentence shown when a stock matches, so every result can explain itself. Missing data
// never passes a filter.

import type { ScreenStrategy, ScreenerRow } from "./types";

/** Data looked up per candidate when a filter or setup needs more than the quote */
export interface Extra {
  // From fundamentals
  sector?: string | null;
  industry?: string | null;
  roe?: number | null;
  revenueGrowth?: number | null;
  profitMargin?: number | null;
  debtToEquity?: number | null; // ratio
  payoutRatio?: number | null;
  // From recent daily prices
  rsi14?: number | null;
  change1m?: number | null;
}

export type Needs = "fundamentals" | "chart";

export interface FilterOption { label: string; value: string }

export interface FilterDef {
  key: string;
  label: string;
  strategies: ScreenStrategy[];
  /** Extra data the filter needs beyond the quote */
  needs?: Needs;
  options: FilterOption[];
  test: (r: ScreenerRow, x: Extra, value: string) => boolean;
  describe: (r: ScreenerRow, x: Extra, value: string) => string;
}

const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const pct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const shares = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`);
const big = (n: number) => (n >= 1e12 ? `${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : `${(n / 1e6).toFixed(0)}M`);

export function daysUntil(date: string | null, today = new Date()): number | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

const between = (v: number | null | undefined, lo: number, hi: number) => ok(v) && v >= lo && v < hi;

export const FILTERS: FilterDef[] = [
  // ── Both strategies ──
  {
    key: "marketCap",
    label: "Market cap",
    strategies: ["swing", "long-term"],
    options: [
      { label: "Mega (200B+)", value: "mega" },
      { label: "Large (10B–200B)", value: "large" },
      { label: "Mid (2B–10B)", value: "mid" },
      { label: "Small (under 2B)", value: "small" },
    ],
    test: (r, _x, v) => {
      const m = r.marketCap;
      if (!ok(m)) return false;
      return v === "mega" ? m >= 200e9 : v === "large" ? between(m, 10e9, 200e9) : v === "mid" ? between(m, 2e9, 10e9) : m < 2e9;
    },
    describe: (r) => `Market cap ${big(r.marketCap!)} ${r.currency ?? ""}`.trim(),
  },
  {
    key: "sector",
    label: "Sector",
    strategies: ["swing", "long-term"],
    needs: "fundamentals",
    options: ["Technology", "Communication", "Consumer Disc.", "Consumer Staples", "Healthcare", "Financials", "Energy", "Industrials", "Utilities", "Materials", "Real Estate"]
      .map((s) => ({ label: s, value: s })),
    test: (_r, x, v) => x.sector === v,
    describe: (_r, x) => `Sector: ${x.sector}`,
  },
  {
    key: "trend50",
    label: "vs 50-day average",
    strategies: ["swing", "long-term"],
    options: [{ label: "Above", value: "above" }, { label: "Below", value: "below" }],
    test: (r, _x, v) => ok(r.price) && ok(r.sma50) && (v === "above" ? r.price > r.sma50 : r.price < r.sma50),
    describe: (r) => `Price ${pct(((r.price! - r.sma50!) / r.sma50!) * 100)} vs its 50-day average`,
  },
  {
    key: "trend200",
    label: "vs 200-day average",
    strategies: ["swing", "long-term"],
    options: [{ label: "Above", value: "above" }, { label: "Below", value: "below" }],
    test: (r, _x, v) => ok(r.price) && ok(r.sma200) && (v === "above" ? r.price > r.sma200 : r.price < r.sma200),
    describe: (r) => `Price ${pct(((r.price! - r.sma200!) / r.sma200!) * 100)} vs its 200-day average`,
  },

  // ── Swing ──
  {
    key: "change",
    label: "Today's change",
    strategies: ["swing"],
    options: [
      { label: "Up 1%+", value: "u1" }, { label: "Up 3%+", value: "u3" }, { label: "Up 5%+", value: "u5" },
      { label: "Down 1%+", value: "d1" }, { label: "Down 3%+", value: "d3" },
    ],
    test: (r, _x, v) => {
      const c = r.changePercent;
      if (!ok(c)) return false;
      const n = Number(v.slice(1));
      return v[0] === "u" ? c >= n : c <= -n;
    },
    describe: (r) => `${pct(r.changePercent!)} today`,
  },
  {
    key: "change1m",
    label: "1-month change",
    strategies: ["swing"],
    needs: "chart",
    options: [
      { label: "Up 5%+", value: "u5" }, { label: "Up 10%+", value: "u10" },
      { label: "Down 5%+", value: "d5" }, { label: "Down 10%+", value: "d10" },
    ],
    test: (_r, x, v) => {
      const c = x.change1m;
      if (!ok(c)) return false;
      const n = Number(v.slice(1));
      return v[0] === "u" ? c >= n : c <= -n;
    },
    describe: (_r, x) => `${pct(x.change1m!)} over the past month`,
  },
  {
    key: "relVolume",
    label: "Volume vs average",
    strategies: ["swing"],
    options: [{ label: "1.5× or more", value: "1.5" }, { label: "2× or more", value: "2" }, { label: "3× or more", value: "3" }],
    test: (r, _x, v) => ok(r.relVolume) && r.relVolume >= Number(v),
    describe: (r) => `Volume ${r.relVolume!.toFixed(1)}× its 3-month average`,
  },
  {
    key: "avgVolume",
    label: "Average volume",
    strategies: ["swing"],
    options: [{ label: "500K+ shares", value: "5e5" }, { label: "1M+ shares", value: "1e6" }, { label: "5M+ shares", value: "5e6" }],
    test: (r, _x, v) => ok(r.avgVolume) && r.avgVolume >= Number(v),
    describe: (r) => `Trades ${shares(r.avgVolume!)} shares a day on average`,
  },
  {
    key: "rsi",
    label: "RSI (14)",
    strategies: ["swing"],
    needs: "chart",
    options: [
      { label: "Oversold (under 30)", value: "lt30" },
      { label: "30–50", value: "30-50" },
      { label: "50–70", value: "50-70" },
      { label: "Overbought (over 70)", value: "gt70" },
    ],
    test: (_r, x, v) => {
      const r = x.rsi14;
      if (!ok(r)) return false;
      return v === "lt30" ? r < 30 : v === "30-50" ? between(r, 30, 50) : v === "50-70" ? between(r, 50, 70) : r >= 70;
    },
    describe: (_r, x) => `RSI(14) ${x.rsi14!.toFixed(1)}`,
  },
  {
    key: "earnings",
    label: "Earnings date",
    strategies: ["swing"],
    options: [
      { label: "None in next 14 days", value: "clear14" },
      { label: "Within 14 days", value: "within14" },
      { label: "Within 30 days", value: "within30" },
    ],
    test: (r, _x, v) => {
      const d = daysUntil(r.earningsDate);
      // Without a scheduled date, "none in the next 14 days" is true as far as anyone knows
      if (v === "clear14") return d === null || d > 14 || d < 0;
      return d !== null && d >= 0 && d <= (v === "within14" ? 14 : 30);
    },
    describe: (r) => {
      const d = daysUntil(r.earningsDate);
      return d === null || d < 0 ? "No earnings date scheduled" : `Earnings ${r.earningsDate} (in ${d} days)`;
    },
  },

  // ── Long-term ──
  {
    key: "change52w",
    label: "52-week change",
    strategies: ["long-term"],
    options: [
      { label: "Up 20%+", value: "u20" }, { label: "Up", value: "u0" },
      { label: "Down", value: "d0" }, { label: "Down 20%+", value: "d20" },
    ],
    test: (r, _x, v) => {
      const c = r.change52w;
      if (!ok(c)) return false;
      const n = Number(v.slice(1));
      return v[0] === "u" ? c >= n && c > 0 : c <= -n && c < 0;
    },
    describe: (r) => `${pct(r.change52w!)} over 52 weeks`,
  },
  {
    key: "pe",
    label: "P/E ratio",
    strategies: ["long-term"],
    options: [
      { label: "Under 10", value: "0-10" }, { label: "10–20", value: "10-20" }, { label: "20–30", value: "20-30" },
      { label: "Over 30", value: "30-9999" }, { label: "Negative earnings", value: "neg" },
    ],
    test: (r, _x, v) => {
      if (!ok(r.pe)) return false;
      if (v === "neg") return r.pe < 0;
      const [lo, hi] = v.split("-").map(Number);
      return r.pe > 0 && between(r.pe, lo, hi);
    },
    describe: (r) => `P/E ${r.pe!.toFixed(1)}`,
  },
  {
    key: "divYield",
    label: "Dividend yield",
    strategies: ["long-term"],
    options: [
      { label: "None", value: "none" }, { label: "Under 2%", value: "0-0.02" },
      { label: "2%–4%", value: "0.02-0.04" }, { label: "4%+", value: "0.04-1" },
    ],
    test: (r, _x, v) => {
      if (v === "none") return !ok(r.divYield) || r.divYield === 0;
      const [lo, hi] = v.split("-").map(Number);
      return ok(r.divYield) && r.divYield > 0 && between(r.divYield, lo, hi);
    },
    describe: (r) => (ok(r.divYield) && r.divYield > 0 ? `Dividend yield ${(r.divYield * 100).toFixed(2)}%` : "Pays no dividend"),
  },
  {
    key: "priceToBook",
    label: "Price / book",
    strategies: ["long-term"],
    options: [{ label: "Under 1", value: "1" }, { label: "Under 3", value: "3" }, { label: "Under 5", value: "5" }],
    test: (r, _x, v) => ok(r.priceToBook) && r.priceToBook > 0 && r.priceToBook < Number(v),
    describe: (r) => `Price/book ${r.priceToBook!.toFixed(1)}`,
  },
  {
    key: "roe",
    label: "Return on equity",
    strategies: ["long-term"],
    needs: "fundamentals",
    options: [{ label: "10%+", value: "0.1" }, { label: "15%+", value: "0.15" }, { label: "20%+", value: "0.2" }],
    test: (_r, x, v) => ok(x.roe) && x.roe >= Number(v),
    describe: (_r, x) => `Return on equity ${(x.roe! * 100).toFixed(1)}%`,
  },
  {
    key: "revenueGrowth",
    label: "Revenue growth",
    strategies: ["long-term"],
    needs: "fundamentals",
    options: [{ label: "Growing", value: "0" }, { label: "5%+", value: "0.05" }, { label: "10%+", value: "0.1" }, { label: "20%+", value: "0.2" }],
    test: (_r, x, v) => ok(x.revenueGrowth) && (Number(v) === 0 ? x.revenueGrowth > 0 : x.revenueGrowth >= Number(v)),
    describe: (_r, x) => `Revenue ${pct(x.revenueGrowth! * 100)} year over year`,
  },
  {
    key: "profitMargin",
    label: "Net margin",
    strategies: ["long-term"],
    needs: "fundamentals",
    options: [{ label: "Profitable", value: "0" }, { label: "10%+", value: "0.1" }, { label: "20%+", value: "0.2" }],
    test: (_r, x, v) => ok(x.profitMargin) && (Number(v) === 0 ? x.profitMargin > 0 : x.profitMargin >= Number(v)),
    describe: (_r, x) => `Net margin ${(x.profitMargin! * 100).toFixed(1)}%`,
  },
  {
    key: "debtToEquity",
    label: "Debt / equity",
    strategies: ["long-term"],
    needs: "fundamentals",
    options: [{ label: "Under 0.5×", value: "0.5" }, { label: "Under 1×", value: "1" }, { label: "Under 2×", value: "2" }],
    test: (_r, x, v) => ok(x.debtToEquity) && x.debtToEquity >= 0 && x.debtToEquity < Number(v),
    describe: (_r, x) => `Debt/equity ${x.debtToEquity!.toFixed(2)}×`,
  },
];

export const filtersFor = (strategy: ScreenStrategy) => FILTERS.filter((f) => f.strategies.includes(strategy));

/** Drops filters that don't belong to the strategy, e.g. after switching strategy */
export function keepFor(strategy: ScreenStrategy, filters: Record<string, string>): Record<string, string> {
  const keys = new Set(filtersFor(strategy).map((f) => f.key));
  return Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && keys.has(k)));
}

export function optionLabel(key: string, value: string): string {
  return FILTERS.find((f) => f.key === key)?.options.find((o) => o.value === value)?.label ?? value;
}
