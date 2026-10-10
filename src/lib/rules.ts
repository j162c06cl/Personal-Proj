// A small rule engine for the screener. Each rule is a plain condition plus a
// sentence describing the match, so every result can answer "why am I seeing this?".

import type { PortfolioPosition, WatchlistItem } from "./types";

type N = number | null;

export interface Signals {
  ticker: string;
  price: N;
  changePercent: N;
  volume: N;
  avgVolume: N;
  sma50: N;
  sma200: N;
  high52: N;
  low52: N;
  marketCap: N;
}

export interface Reason {
  text: string;
  tone: "good" | "warn" | "neutral";
  kind: "signal" | "context";
}

interface Rule {
  /** True when the stock meets the condition. Missing data never passes. */
  test: (s: Signals) => boolean;
  /** Sentence shown to the user when it passes; omit for silent qualifiers (e.g. liquidity) */
  describe?: (s: Signals) => string;
}

export type SwingPresetId = "momentum" | "breakout" | "pullback";

export interface SwingPreset {
  id: SwingPresetId;
  name: string;
  summary: string;
  /** How the server should pre-select candidates before the rules run */
  query: { sort: "percentchange" | "intradaymarketcap"; minChange?: number };
  rules: Rule[];
}

// ── helpers ─────────────────────────────────────────────────────────────────

const pct = (a: number, b: number) => ((a - b) / b) * 100;
const fmt = (v: number, d = 1) => Math.abs(v).toFixed(d);
const relVol = (s: Signals) => (s.volume && s.avgVolume ? s.volume / s.avgVolume : null);
const has = (...v: N[]) => v.every((x) => x !== null && Number.isFinite(x));

export const MIN_MARKET_CAP = 2e9;
export const MIN_PRICE = 5;

// Liquid enough to enter and exit a swing trade without moving the price
const liquid: Rule = {
  test: (s) => has(s.marketCap, s.price) && s.marketCap! >= MIN_MARKET_CAP && s.price! >= MIN_PRICE,
};

// ── presets ─────────────────────────────────────────────────────────────────

export const SWING_PRESETS: SwingPreset[] = [
  {
    id: "momentum",
    name: "Momentum",
    summary: "Established uptrend, moving higher today on above-average volume.",
    query: { sort: "percentchange", minChange: 1 },
    rules: [
      liquid,
      {
        test: (s) => has(s.price, s.sma50, s.sma200) && s.price! > s.sma50! && s.sma50! > s.sma200!,
        describe: (s) => `Uptrend: price ${fmt(pct(s.price!, s.sma50!))}% above its 50-day average, which is above the 200-day`,
      },
      { test: (s) => has(s.changePercent) && s.changePercent! >= 1, describe: (s) => `Up ${fmt(s.changePercent!)}% today` },
      { test: (s) => (relVol(s) ?? 0) >= 1.2, describe: (s) => `Volume ${relVol(s)!.toFixed(1)}× average` },
    ],
  },
  {
    id: "breakout",
    name: "Breakout",
    summary: "Pushing to or near a 52-week high, with heavy volume backing the move.",
    query: { sort: "percentchange", minChange: 1 },
    rules: [
      liquid,
      {
        test: (s) => has(s.price, s.high52) && s.price! >= s.high52! * 0.97,
        describe: (s) => (s.price! >= s.high52! * 0.995
          ? "At a new 52-week high"
          : `Within ${fmt(-pct(s.price!, s.high52!))}% of its 52-week high`),
      },
      { test: (s) => (relVol(s) ?? 0) >= 1.5, describe: (s) => `Volume ${relVol(s)!.toFixed(1)}× average, confirming the move` },
      { test: (s) => has(s.changePercent) && s.changePercent! >= 1, describe: (s) => `Up ${fmt(s.changePercent!)}% today` },
    ],
  },
  {
    id: "pullback",
    name: "Pullback",
    summary: "Longer-term uptrend that has dipped back to its 50-day average.",
    query: { sort: "intradaymarketcap" },
    rules: [
      liquid,
      {
        test: (s) => has(s.price, s.sma50, s.sma200) && s.sma50! > s.sma200! && s.price! > s.sma200!,
        describe: () => "Longer-term uptrend: 50-day average above the 200-day",
      },
      {
        test: (s) => has(s.price, s.high52) && pct(s.price!, s.high52!) <= -5 && pct(s.price!, s.high52!) >= -20,
        describe: (s) => `Pulled back ${fmt(-pct(s.price!, s.high52!))}% from its 52-week high`,
      },
      {
        test: (s) => has(s.price, s.sma50) && Math.abs(pct(s.price!, s.sma50!)) <= 3,
        describe: (s) => {
          const d = pct(s.price!, s.sma50!);
          return `Trading ${fmt(d)}% ${d >= 0 ? "above" : "below"} its 50-day average, a common support level`;
        },
      },
      // Not in free fall today
      { test: (s) => has(s.changePercent) && s.changePercent! > -4 },
    ],
  },
];

export function evaluate(preset: SwingPreset, s: Signals): { pass: boolean; reasons: Reason[] } {
  const reasons: Reason[] = [];
  for (const rule of preset.rules) {
    if (!rule.test(s)) return { pass: false, reasons: [] };
    if (rule.describe) reasons.push({ text: rule.describe(s), tone: "good", kind: "signal" });
  }
  return { pass: true, reasons };
}

// ── portfolio context ───────────────────────────────────────────────────────

/** Yahoo's sector names → the names this app uses for portfolio sectors */
const SECTOR_ALIASES: Record<string, string> = {
  "Consumer Cyclical": "Consumer Disc.",
  "Consumer Defensive": "Consumer Staples",
  "Communication Services": "Communication",
  "Financial Services": "Financials",
  "Basic Materials": "Materials",
};
export const normaliseSector = (s: string | null | undefined) => (s ? SECTOR_ALIASES[s] ?? s : null);

export interface Holding {
  ticker: string;
  sector: string | null;
  industry: string | null;
  value: number;
}

export interface ContextInput {
  ticker: string;
  sector: string | null;
  industry: string | null;
  holdings: Holding[];
  positions: PortfolioPosition[];
  watchlist: WatchlistItem[];
  watchedSectors: string[];
}

const INTENT_LABEL: Record<WatchlistItem["intent"], string> = { "long-term": "Long-term", swing: "Swing", research: "Research later" };

/** Reasons that relate a candidate to the investor's own portfolio and plans. */
export function contextReasons(c: ContextInput): Reason[] {
  const out: Reason[] = [];
  const total = c.holdings.reduce((s, h) => s + h.value, 0);
  const sector = normaliseSector(c.sector);

  const owned = c.positions.filter((p) => p.ticker === c.ticker).reduce((s, p) => s + p.quantity, 0);
  if (owned > 0) out.push({ text: `You already own ${owned} shares`, tone: "neutral", kind: "context" });

  const watched = c.watchlist.find((w) => w.ticker === c.ticker);
  if (watched) out.push({ text: `On your watchlist (${INTENT_LABEL[watched.intent]})`, tone: "neutral", kind: "context" });

  if (total > 0 && !owned) {
    const sameIndustry = c.industry ? c.holdings.filter((h) => h.industry === c.industry) : [];
    const sameSector = sector ? c.holdings.filter((h) => normaliseSector(h.sector) === sector) : [];
    const share = (hs: Holding[]) => (hs.reduce((s, h) => s + h.value, 0) / total) * 100;

    if (sameIndustry.length) {
      const w = share(sameIndustry);
      out.push({
        text: `Adds to your ${c.industry!.toLowerCase()} exposure (${w.toFixed(0)}% of portfolio: ${sameIndustry.map((h) => h.ticker).join(", ")})`,
        tone: w >= 25 ? "warn" : "neutral",
        kind: "context",
      });
    } else if (sameSector.length) {
      const w = share(sameSector);
      out.push({
        text: `Adds to your ${sector} exposure (${w.toFixed(0)}% of portfolio)`,
        tone: w >= 30 ? "warn" : "neutral",
        kind: "context",
      });
    } else if (sector) {
      out.push({ text: `Diversifies: you hold nothing in ${sector} yet`, tone: "good", kind: "context" });
    }
  }

  if (sector && c.watchedSectors.includes(sector)) {
    out.push({ text: `In a sector you watch (${sector})`, tone: "good", kind: "context" });
  }
  return out;
}
