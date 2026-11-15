/**
 * Rates single numbers as good / neutral / bad with a short reason, and rolls those
 * ratings up into a Buy / Hold / Sell call. The thresholds ("benchmarks") are rules of
 * thumb for a typical company, not sector-adjusted; the user can change them in
 * Settings → Benchmarks. The call is a summary of the numbers, not financial advice.
 *
 * Units: fundamentals arrive as fractions (0.12 = 12%), technicals as percents (12 = 12%).
 * Benchmarks are always stored in the units shown on screen (12 = 12%).
 */

export type Rating = "good" | "neutral" | "bad";
export interface Rated { rating: Rating; note: string }

export type ScoredTab = "financials" | "valuation" | "technical" | "risks";
export type Call = "Buy" | "Hold" | "Sell";
export type CallStrategy = "long-term" | "swing";

// ── Benchmarks ──────────────────────────────────────────────────────────────

/** Two lines splitting a number into green / grey / red */
export interface Band { good: number; bad: number }

export type BandKey =
  | "pe" | "forwardPE" | "peg" | "priceToSales" | "priceToBook" | "evToEbitda" | "peVsHistory" | "analystUpside"
  | "growth" | "grossMargin" | "operatingMargin" | "netMargin" | "roe" | "debtToEquity" | "currentRatio"
  | "rsi" | "fromHigh"
  | "beta" | "volatility" | "drawdown" | "shortInterest" | "payout";

export interface Benchmarks {
  bands: Record<BandKey, Band>;
  /** How much each tab counts towards the call, per strategy. Relative, so they needn't add to 100 */
  weights: Record<CallStrategy, Record<ScoredTab, number>>;
  /** Weighted score (−1…1) at or above which the call is Buy, and at or below minus which it's Sell */
  callThreshold: number;
  /** Fewest rated numbers before a call is made at all */
  minRated: number;
}

export interface BandDef {
  key: BandKey;
  label: string;
  tab: ScoredTab;
  /** "higher": green at or above `good`, red below `bad`. "lower": green below `good`, red above `bad` */
  dir: "higher" | "lower";
  unit: "" | "×" | "%";
  /** Where the default lines come from */
  why: string;
  goodLabel?: string;
  badLabel?: string;
}

export const BAND_DEFS: BandDef[] = [
  // Financials
  { key: "growth", label: "Revenue & earnings growth", tab: "financials", dir: "higher", unit: "%",
    why: "10% a year is roughly double the economy's growth rate. Any shrinking is red. Used for revenue, earnings and quarterly EPS growth." },
  { key: "grossMargin", label: "Gross margin", tab: "financials", dir: "higher", unit: "%",
    why: "40%+ usually means pricing power (software, strong brands). Under 20% is commodity-like." },
  { key: "operatingMargin", label: "Operating margin", tab: "financials", dir: "higher", unit: "%",
    why: "Large US companies average roughly 15%. Under 5% leaves little room for a bad year." },
  { key: "netMargin", label: "Net margin", tab: "financials", dir: "higher", unit: "%",
    why: "Around 10% is typical for a large company. A loss is red." },
  { key: "roe", label: "Return on equity", tab: "financials", dir: "higher", unit: "%",
    why: "15% is a long-standing quality bar (a Warren Buffett rule of thumb). Under 5% barely beats cash in the bank." },
  { key: "debtToEquity", label: "Debt / equity", tab: "financials", dir: "lower", unit: "×",
    why: "Less debt than equity (under 1×) is conservative. Over 2× is heavy for most non-financial companies. Negative equity is always red." },
  { key: "currentRatio", label: "Current ratio", tab: "financials", dir: "higher", unit: "×",
    why: "1.5× covers the next year's bills comfortably. Under 1× means bills due exceed liquid assets." },
  // Valuation
  { key: "pe", label: "P/E (trailing)", tab: "valuation", dir: "lower", unit: "×",
    why: "15 is about the US market's long-run average P/E. Over 30 is roughly double it. Losses are always red." },
  { key: "forwardPE", label: "P/E (forward)", tab: "valuation", dir: "lower", unit: "×",
    why: "Forward P/Es run lower than trailing ones because profits are expected to grow, so the red line is lower." },
  { key: "peg", label: "PEG ratio", tab: "valuation", dir: "lower", unit: "×",
    why: "Peter Lynch's rule: under 1 you aren't overpaying for the growth, over 2 you probably are." },
  { key: "priceToSales", label: "Price / sales", tab: "valuation", dir: "lower", unit: "×",
    why: "Most established companies trade at 1–8× sales. Under 2× is cheap for a profitable business." },
  { key: "priceToBook", label: "Price / book", tab: "valuation", dir: "lower", unit: "×",
    why: "Under 1.5× is close to the value of the company's assets (Benjamin Graham's test). Over 5× means paying mostly for brand and growth." },
  { key: "evToEbitda", label: "EV / EBITDA", tab: "valuation", dir: "lower", unit: "×",
    why: "The market usually sits around 12–15×. Under 10 is cheap, over 20 is rich." },
  { key: "peVsHistory", label: "P/E vs its 4-yr average", tab: "valuation", dir: "lower", unit: "%",
    why: "Within ±10% of the stock's own average P/E counts as normal for that stock.",
    goodLabel: "Green under", badLabel: "Red over" },
  { key: "analystUpside", label: "Upside to analyst target", tab: "valuation", dir: "higher", unit: "%",
    why: "A 10%+ gap to the average target suggests room to rise. Trading 5% above it means analysts see it as fully priced." },
  // Technical
  { key: "rsi", label: "RSI (14)", tab: "technical", dir: "lower", unit: "",
    why: "J. Welles Wilder's original levels: over 70 is overbought. 50 splits rising from falling momentum. Under 50 is grey either way.",
    goodLabel: "Green from", badLabel: "Red (overbought) from" },
  { key: "fromHigh", label: "From 52-week high", tab: "technical", dir: "higher", unit: "%",
    why: "Within 10% of the high is a normal pullback. 25%+ below is a bear-market-sized fall." },
  // Risks
  { key: "beta", label: "Beta", tab: "risks", dir: "lower", unit: "",
    why: "1.0 moves exactly with the market. The band either side allows for normal variation." },
  { key: "volatility", label: "Volatility (1y)", tab: "risks", dir: "lower", unit: "%",
    why: "The S&P 500 typically swings 15–20% a year. Most single stocks swing 25–45%." },
  { key: "drawdown", label: "Max drawdown (1y)", tab: "risks", dir: "higher", unit: "%",
    why: "A 15% dip happens most years. A 30%+ fall is a serious decline." },
  { key: "shortInterest", label: "Short % of float", tab: "risks", dir: "lower", unit: "%",
    why: "Under 5% of shares sold short is normal. Over 10% means many investors are betting on a fall." },
  { key: "payout", label: "Dividend payout ratio", tab: "risks", dir: "lower", unit: "%",
    why: "Paying out under 60% of profit leaves room to keep the dividend if profits dip. Over 80% doesn't." },
];

export const DEFAULT_BENCHMARKS: Benchmarks = {
  bands: {
    pe: { good: 15, bad: 30 },
    forwardPE: { good: 15, bad: 25 },
    peg: { good: 1, bad: 2 },
    priceToSales: { good: 2, bad: 8 },
    priceToBook: { good: 1.5, bad: 5 },
    evToEbitda: { good: 10, bad: 20 },
    peVsHistory: { good: -10, bad: 10 },
    analystUpside: { good: 10, bad: -5 },
    growth: { good: 10, bad: 0 },
    grossMargin: { good: 40, bad: 20 },
    operatingMargin: { good: 15, bad: 5 },
    netMargin: { good: 10, bad: 0 },
    roe: { good: 15, bad: 5 },
    debtToEquity: { good: 1, bad: 2 },
    currentRatio: { good: 1.5, bad: 1 },
    rsi: { good: 50, bad: 70 },
    fromHigh: { good: -10, bad: -25 },
    beta: { good: 0.8, bad: 1.3 },
    volatility: { good: 25, bad: 45 },
    drawdown: { good: -15, bad: -30 },
    shortInterest: { good: 5, bad: 10 },
    payout: { good: 60, bad: 80 },
  },
  weights: {
    "long-term": { financials: 35, valuation: 30, technical: 15, risks: 20 },
    swing: { financials: 10, valuation: 10, technical: 55, risks: 25 },
  },
  callThreshold: 0.25,
  minRated: 6,
};

/** The green line must sit on the "better" side of the red line */
export function validBand(def: Pick<BandDef, "dir">, b: Band): boolean {
  if (!Number.isFinite(b.good) || !Number.isFinite(b.bad)) return false;
  return def.dir === "higher" ? b.good >= b.bad : b.good <= b.bad;
}

const DEF_BY_KEY = Object.fromEntries(BAND_DEFS.map((d) => [d.key, d])) as Record<BandKey, BandDef>;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Fills gaps and drops anything invalid from stored benchmarks, falling back to the defaults */
export function normalizeBenchmarks(raw: unknown): Benchmarks {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Benchmarks, unknown>>;
  const bandsIn = (src.bands && typeof src.bands === "object" ? src.bands : {}) as Record<string, Partial<Band> | undefined>;
  const bands = { ...DEFAULT_BENCHMARKS.bands };
  for (const key of Object.keys(bands) as BandKey[]) {
    const b = bandsIn[key];
    if (b && isNum(b.good) && isNum(b.bad) && validBand(DEF_BY_KEY[key], { good: b.good, bad: b.bad })) {
      bands[key] = { good: b.good, bad: b.bad };
    }
  }
  const weightsIn = (src.weights && typeof src.weights === "object" ? src.weights : {}) as Record<string, Record<string, unknown> | undefined>;
  const weights = {} as Benchmarks["weights"];
  for (const strat of Object.keys(DEFAULT_BENCHMARKS.weights) as CallStrategy[]) {
    const w = { ...DEFAULT_BENCHMARKS.weights[strat] };
    for (const tab of Object.keys(w) as ScoredTab[]) {
      const v = weightsIn[strat]?.[tab];
      if (isNum(v) && v >= 0) w[tab] = v;
    }
    // All-zero weights would make a call impossible
    weights[strat] = Object.values(w).some((v) => v > 0) ? w : { ...DEFAULT_BENCHMARKS.weights[strat] };
  }
  const t = src.callThreshold;
  const m = src.minRated;
  return {
    bands,
    weights,
    callThreshold: isNum(t) && t > 0 && t <= 1 ? t : DEFAULT_BENCHMARKS.callThreshold,
    minRated: isNum(m) && m >= 1 ? Math.round(m) : DEFAULT_BENCHMARKS.minRated,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const D = DEFAULT_BENCHMARKS;
const r = (rating: Rating, note: string): Rated => ({ rating, note });
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Fraction → percent without float noise (0.29 → 29, not 28.999…) */
const asPct = (v: number) => Math.round(v * 1e8) / 1e6;
/** Shortest readable form of a benchmark (15, 1.5, 0.25) */
const n = (v: number) => String(Math.round(v * 100) / 100);

function zone(v: number, t: Band, dir: "higher" | "lower"): Rating {
  if (dir === "higher") return v >= t.good ? "good" : v >= t.bad ? "neutral" : "bad";
  return v < t.good ? "good" : v <= t.bad ? "neutral" : "bad";
}

function pick(v: number, key: BandKey, b: Benchmarks, notes: Record<Rating, string>): Rated {
  const rating = zone(v, b.bands[key], DEF_BY_KEY[key].dir);
  return r(rating, notes[rating]);
}

// ── Valuation (lower is better) ─────────────────────────────────────────────

export function ratePE(pe: number | null, b: Benchmarks = D): Rated | null {
  if (pe === null) return null;
  if (pe <= 0) return r("bad", "Loss-making");
  const t = b.bands.pe;
  return pick(pe, "pe", b, {
    good: `Cheap (under ${n(t.good)})`,
    neutral: `Around market levels (${n(t.good)}–${n(t.bad)})`,
    bad: `Expensive (over ${n(t.bad)})`,
  });
}

export function rateForwardPE(pe: number | null, b: Benchmarks = D): Rated | null {
  if (pe === null) return null;
  if (pe <= 0) return r("bad", "Losses expected");
  return pick(pe, "forwardPE", b, {
    good: "Cheap on next year's profit",
    neutral: "Fair on next year's profit",
    bad: "Expensive even on next year's profit",
  });
}

/** P/E ÷ earnings growth in percent. Only meaningful when earnings are growing. */
export function pegRatio(pe: number | null, earningsGrowth: number | null): number | null {
  if (pe === null || pe <= 0 || earningsGrowth === null || earningsGrowth <= 0) return null;
  return pe / (earningsGrowth * 100);
}

export function ratePEG(peg: number | null, b: Benchmarks = D): Rated | null {
  if (peg === null) return null;
  return pick(peg, "peg", b, {
    good: "Growth more than justifies the P/E",
    neutral: "P/E roughly in line with growth",
    bad: "P/E high for its growth",
  });
}

export function ratePriceToSales(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null || v <= 0) return null;
  return pick(v, "priceToSales", b, { good: "Low for its sales", neutral: "Typical", bad: "High for its sales" });
}

export function ratePriceToBook(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null || v <= 0) return null;
  return pick(v, "priceToBook", b, { good: "Near its asset value", neutral: "Typical", bad: "Well above its asset value" });
}

export function rateEvToEbitda(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null || v <= 0) return null;
  const t = b.bands.evToEbitda;
  return pick(v, "evToEbitda", b, {
    good: `Cheap (under ${n(t.good)})`,
    neutral: `Fair (${n(t.good)}–${n(t.bad)})`,
    bad: `Expensive (over ${n(t.bad)})`,
  });
}

/** Today's P/E against the stock's own recent average */
export function ratePEvsHistory(pe: number | null, avg: number | null, b: Benchmarks = D): Rated | null {
  if (pe === null || pe <= 0 || avg === null || avg <= 0) return null;
  const d = (pe - avg) / avg;
  return pick(asPct(d), "peVsHistory", b, {
    good: `${pct(-d)} below its usual P/E`,
    neutral: "Near its usual P/E",
    bad: `${pct(d)} above its usual P/E`,
  });
}

export function rateAnalystUpside(upside: number | null, b: Benchmarks = D): Rated | null {
  if (upside === null) return null;
  return pick(asPct(upside), "analystUpside", b, {
    good: "Analysts see room to rise",
    neutral: "Near analysts' target",
    bad: "Above analysts' target",
  });
}

// ── Growth & profitability (higher is better) ──────────────────────────────

export function rateGrowth(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(asPct(v), "growth", b, { good: "Growing fast", neutral: "Growing slowly", bad: "Shrinking" });
}

export function rateGrossMargin(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(asPct(v), "grossMargin", b, { good: "Strong pricing power", neutral: "Average", bad: "Thin" });
}

export function rateOperatingMargin(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(asPct(v), "operatingMargin", b, { good: "Highly profitable", neutral: "Modest", bad: v < 0 ? "Losing money" : "Thin" });
}

export function rateNetMargin(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(asPct(v), "netMargin", b, { good: "Keeps a lot of each sale", neutral: "Modest", bad: v < 0 ? "Losing money" : "Thin" });
}

export function rateROE(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(asPct(v), "roe", b, { good: "Uses capital well", neutral: "Average", bad: v < 0 ? "Losing money" : "Weak" });
}

// ── Financial health ────────────────────────────────────────────────────────

export function rateFreeCashFlow(v: number | null): Rated | null {
  if (v === null) return null;
  if (v > 0) return r("good", "Generates cash");
  if (v < 0) return r("bad", "Burning cash");
  return r("neutral", "Break-even");
}

export function rateNetCash(cash: number | null, debt: number | null): Rated | null {
  if (cash === null || debt === null) return null;
  return cash >= debt ? r("good", "More cash than debt") : r("neutral", "More debt than cash");
}

/** Debt ÷ equity as a ratio (1.5 = 1.5×) */
export function rateDebtToEquity(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  if (v < 0) return r("bad", "Negative equity");
  return pick(v, "debtToEquity", b, { good: "Low debt", neutral: "Moderate debt", bad: "Heavy debt" });
}

export function rateCurrentRatio(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(v, "currentRatio", b, {
    good: "Bills well covered",
    neutral: "Bills just covered",
    bad: "Short-term bills exceed liquid assets",
  });
}

// ── Technicals ──────────────────────────────────────────────────────────────

export function ratePriceVsAverage(price: number | null, avg: number | null): Rated | null {
  if (price === null || avg === null || avg <= 0) return null;
  const d = (price - avg) / avg;
  if (d > 0.01) return r("good", `Price ${(d * 100).toFixed(1)}% above`);
  if (d < -0.01) return r("bad", `Price ${(-d * 100).toFixed(1)}% below`);
  return r("neutral", "Price sitting on it");
}

export function rateCross(sma50: number | null, sma200: number | null): Rated | null {
  if (sma50 === null || sma200 === null) return null;
  return sma50 > sma200
    ? r("good", "50-day above 200-day (golden cross)")
    : r("bad", "50-day below 200-day (death cross)");
}

export function rateTrend(trend: "Uptrend" | "Downtrend" | "Mixed" | null): Rated | null {
  if (trend === null) return null;
  if (trend === "Uptrend") return r("good", "Price above rising averages");
  if (trend === "Downtrend") return r("bad", "Price below falling averages");
  return r("neutral", "Averages disagree");
}

/** Overbought is red, positive momentum green, everything below that grey */
export function rateRSI(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  const t = b.bands.rsi;
  if (v >= t.bad) return r("bad", "Overbought: rose fast, may cool off");
  if (v >= t.good) return r("good", "Positive momentum");
  if (v > 30) return r("neutral", "Weak momentum");
  return r("neutral", "Oversold: fell fast, may bounce");
}

export function rateMACD(
  macd: number | null,
  signal: number | null,
  cross: { dir: "bullish" | "bearish"; barsAgo: number } | null
): Rated | null {
  if (cross && cross.barsAgo <= 5) {
    const when = cross.barsAgo === 0 ? "today" : `${cross.barsAgo}d ago`;
    return cross.dir === "bullish" ? r("good", `Bullish cross ${when}`) : r("bad", `Bearish cross ${when}`);
  }
  if (macd === null || signal === null) return null;
  return macd > signal ? r("good", "Above signal line") : r("bad", "Below signal line");
}

/** % from the 52-week high, as a negative percent (-12 = 12% below) */
export function rateFromHigh(pctFromHigh: number | null, b: Benchmarks = D): Rated | null {
  if (pctFromHigh === null) return null;
  return pick(pctFromHigh, "fromHigh", b, {
    good: "Near its 1-year high",
    neutral: "Pulled back from its high",
    bad: "Far below its high",
  });
}

// ── Risk (lower is better) ──────────────────────────────────────────────────

export function rateBeta(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(v, "beta", b, { good: "Calmer than the market", neutral: "Moves with the market", bad: "Swings more than the market" });
}

export function rateVolatility(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(v, "volatility", b, { good: "Steady", neutral: "Average swings", bad: "Very bumpy" });
}

/** Max drawdown as a negative percent */
export function rateDrawdown(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(v, "drawdown", b, { good: "Shallow dips", neutral: "Normal dips", bad: "Deep fall in the past year" });
}

export function rateShortInterest(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null) return null;
  return pick(asPct(v), "shortInterest", b, { good: "Few bets against it", neutral: "Some bets against it", bad: "Heavily shorted" });
}

export function ratePayout(v: number | null, b: Benchmarks = D): Rated | null {
  if (v === null || v <= 0) return null;
  return pick(asPct(v), "payout", b, {
    good: "Dividend well covered",
    neutral: "Dividend covered",
    bad: "Dividend at risk if profits dip",
  });
}

export function rateEarningsSoon(days: number | null): Rated | null {
  if (days === null || days < 0) return null;
  if (days <= 14) return r("neutral", "Price can jump either way on results");
  return null;
}

/** Rules with no adjustable lines, listed on the Benchmarks settings page */
export const FIXED_RULES: { label: string; rule: string }[] = [
  { label: "Price vs 20/50-day EMA and 200-day average", rule: "Green more than 1% above, red more than 1% below, grey in between" },
  { label: "50 vs 200-day average", rule: "Green for a golden cross (50 above 200), red for a death cross" },
  { label: "Trend", rule: "Green for an uptrend, red for a downtrend, grey when the averages disagree" },
  { label: "MACD", rule: "A cross in the last 5 days decides it; otherwise green above the signal line, red below" },
  { label: "Free cash flow", rule: "Green if positive, red if negative" },
  { label: "Cash vs debt", rule: "Green with more cash than debt, grey otherwise" },
  { label: "Next earnings", rule: "Grey within 14 days, since the price can jump either way" },
];

// ── Roll-up ─────────────────────────────────────────────────────────────────

export interface Signal { good: number; neutral: number; bad: number; /** (good − bad) ÷ rated, −1…1; null if nothing rated */ score: number | null }

export function signalOf(ratings: (Rated | null | undefined)[]): Signal {
  let good = 0, neutral = 0, bad = 0;
  for (const x of ratings) {
    if (!x) continue;
    if (x.rating === "good") good++;
    else if (x.rating === "bad") bad++;
    else neutral++;
  }
  const total = good + neutral + bad;
  return { good, neutral, bad, score: total ? (good - bad) / total : null };
}

/** Tone for a section score, matching the call thresholds */
export function signalTone(s: Signal, b: Benchmarks = D): Rating | null {
  if (s.score === null) return null;
  return s.score >= b.callThreshold ? "good" : s.score <= -b.callThreshold ? "bad" : "neutral";
}

export function overallCall(
  signals: Record<ScoredTab, Signal>,
  strategy: CallStrategy,
  b: Benchmarks = D
): { call: Call; score: number } | null {
  const w = b.weights[strategy];
  let total = 0, weight = 0, rated = 0;
  for (const tab of Object.keys(w) as ScoredTab[]) {
    const s = signals[tab];
    rated += s.good + s.neutral + s.bad;
    if (s.score === null || w[tab] <= 0) continue;
    total += s.score * w[tab];
    weight += w[tab];
  }
  if (!weight || rated < b.minRated) return null;
  const score = total / weight;
  return { call: score >= b.callThreshold ? "Buy" : score <= -b.callThreshold ? "Sell" : "Hold", score };
}
