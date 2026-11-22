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
  /** Trading currency; markets outside the US get a lower minimum share price */
  currency?: string | null;
  // Long-term inputs: valuation from the quote, the rest from fundamentals when looked up
  pe?: N;
  forwardPE?: N;
  priceToBook?: N;
  divYield?: N;
  change52w?: N;
  roe?: N;
  revenueGrowth?: N;
  profitMargin?: N;
  debtToEquity?: N; // ratio, e.g. 0.8
  payoutRatio?: N;
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
export type LongTermPresetId = "quality" | "value" | "dividend" | "leaders";

export interface Setup<Id extends string = string> {
  id: Id;
  name: string;
  summary: string;
  /** How results are ordered before the user sorts them */
  sort: "changePercent" | "marketCap";
  /** True when some rules need company fundamentals, which are looked up per candidate */
  needsFundamentals?: boolean;
  rules: Rule[];
}

export type SwingPreset = Setup<SwingPresetId>;
export type LongTermPreset = Setup<LongTermPresetId>;

// ── helpers ─────────────────────────────────────────────────────────────────

const pct = (a: number, b: number) => ((a - b) / b) * 100;
const fmt = (v: number, d = 1) => Math.abs(v).toFixed(d);
const relVol = (s: Signals) => (s.volume && s.avgVolume ? s.volume / s.avgVolume : null);
const has = (...v: (N | undefined)[]) => v.every((x) => x !== null && x !== undefined && Number.isFinite(x));

export const MIN_MARKET_CAP = 2e9;
export const MIN_PRICE = 5;
/** Outside the US, sound large companies often trade below 5 a share (e.g. S$4 Singtel) */
const MIN_PRICE_NON_USD = 0.2;
const isUsd = (s: Signals) => !s.currency || s.currency === "USD";

// Liquid enough to enter and exit a swing trade without moving the price
const liquid: Rule = {
  test: (s) => has(s.marketCap, s.price) && s.marketCap! >= MIN_MARKET_CAP && s.price! >= (isUsd(s) ? MIN_PRICE : MIN_PRICE_NON_USD),
};

// ── presets ─────────────────────────────────────────────────────────────────

export const SWING_PRESETS: SwingPreset[] = [
  {
    id: "momentum",
    name: "Momentum",
    summary: "Established uptrend, moving higher today on above-average volume.",
    sort: "changePercent",
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
    sort: "changePercent",
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
    sort: "marketCap",
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

// Long-term setups judge the business and the long trend, never today's move
const pctOf = (v: number) => `${(v * 100).toFixed(1)}%`;

export const LONG_TERM_PRESETS: LongTermPreset[] = [
  {
    id: "quality",
    name: "Quality growth",
    summary: "Profitable, growing companies earning high returns on shareholders' money.",
    sort: "marketCap",
    needsFundamentals: true,
    rules: [
      { test: (s) => has(s.marketCap) && s.marketCap! >= MIN_MARKET_CAP },
      { test: (s) => has(s.roe) && s.roe! >= 0.15, describe: (s) => `Return on equity ${pctOf(s.roe!)} (15%+ is strong)` },
      { test: (s) => has(s.revenueGrowth) && s.revenueGrowth! >= 0.05, describe: (s) => `Revenue up ${pctOf(s.revenueGrowth!)} year over year` },
      { test: (s) => has(s.profitMargin) && s.profitMargin! >= 0.1, describe: (s) => `Net margin ${pctOf(s.profitMargin!)}` },
      {
        test: (s) => has(s.price, s.sma200) && s.price! > s.sma200!,
        describe: (s) => `Long-term trend intact: price ${fmt(pct(s.price!, s.sma200!))}% above its 200-day average`,
      },
    ],
  },
  {
    id: "value",
    name: "Reasonable value",
    summary: "Profitable companies on modest earnings and book multiples, with earnings expected to grow.",
    sort: "marketCap",
    needsFundamentals: true,
    rules: [
      { test: (s) => has(s.marketCap) && s.marketCap! >= MIN_MARKET_CAP },
      { test: (s) => has(s.pe) && s.pe! > 0 && s.pe! <= 18, describe: (s) => `P/E ${s.pe!.toFixed(1)} (18 or below)` },
      {
        test: (s) => has(s.pe, s.forwardPE) && s.forwardPE! > 0 && s.forwardPE! < s.pe!,
        describe: (s) => `Forward P/E ${s.forwardPE!.toFixed(1)} is below trailing: analysts expect earnings to grow`,
      },
      { test: (s) => has(s.priceToBook) && s.priceToBook! > 0 && s.priceToBook! <= 3, describe: (s) => `Price/book ${s.priceToBook!.toFixed(1)}` },
      { test: (s) => has(s.profitMargin) && s.profitMargin! > 0.05, describe: (s) => `Net margin ${pctOf(s.profitMargin!)}` },
    ],
  },
  {
    id: "dividend",
    name: "Dividend income",
    summary: "Larger companies paying 3%+ that keep enough earnings to sustain it.",
    sort: "marketCap",
    needsFundamentals: true,
    rules: [
      { test: (s) => has(s.marketCap) && s.marketCap! >= 5e9 },
      { test: (s) => has(s.divYield) && s.divYield! >= 0.03, describe: (s) => `Dividend yield ${pctOf(s.divYield!)}` },
      {
        test: (s) => has(s.payoutRatio) && s.payoutRatio! > 0 && s.payoutRatio! <= 0.8,
        describe: (s) => `Pays out ${pctOf(s.payoutRatio!)} of earnings, leaving room to keep paying`,
      },
      {
        test: (s) => has(s.change52w) && s.change52w! > -20,
        describe: (s) => `${s.change52w! >= 0 ? "Up" : "Down"} ${fmt(s.change52w!)}% over 52 weeks (no collapse in price)`,
      },
    ],
  },
  {
    id: "leaders",
    name: "Long-term leaders",
    summary: "Large companies in an established uptrend, outperforming over the past year.",
    sort: "marketCap",
    rules: [
      { test: (s) => has(s.marketCap) && s.marketCap! >= 10e9 },
      {
        test: (s) => has(s.price, s.sma50, s.sma200) && s.price! > s.sma200! && s.sma50! > s.sma200!,
        describe: () => "Above its 200-day average, with the 50-day above the 200-day",
      },
      { test: (s) => has(s.change52w) && s.change52w! >= 15, describe: (s) => `Up ${fmt(s.change52w!)}% over 52 weeks` },
    ],
  },
];

export function evaluate(preset: Setup, s: Signals): { pass: boolean; reasons: Reason[] } {
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

  return out;
}
