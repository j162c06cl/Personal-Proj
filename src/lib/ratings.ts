/**
 * Rates single numbers as good / neutral / bad with a short reason, and rolls those
 * ratings up into a Buy / Hold / Sell call. Thresholds are simple rules of thumb for
 * a typical company, not sector-adjusted, and the call is a summary of the numbers,
 * not financial advice.
 *
 * Units: fundamentals arrive as fractions (0.12 = 12%), technicals as percents (12 = 12%).
 */

export type Rating = "good" | "neutral" | "bad";
export interface Rated { rating: Rating; note: string }

const r = (rating: Rating, note: string): Rated => ({ rating, note });
const pct = (v: number) => `${Math.round(v * 100)}%`;

// ── Valuation (lower is better) ─────────────────────────────────────────────

export function ratePE(pe: number | null): Rated | null {
  if (pe === null) return null;
  if (pe <= 0) return r("bad", "Loss-making");
  if (pe < 15) return r("good", "Cheap (under 15)");
  if (pe <= 30) return r("neutral", "Around market levels (15–30)");
  return r("bad", "Expensive (over 30)");
}

export function rateForwardPE(pe: number | null): Rated | null {
  if (pe === null) return null;
  if (pe <= 0) return r("bad", "Losses expected");
  if (pe < 15) return r("good", "Cheap on next year's profit");
  if (pe <= 25) return r("neutral", "Fair on next year's profit");
  return r("bad", "Expensive even on next year's profit");
}

/** P/E ÷ earnings growth in percent. Only meaningful when earnings are growing. */
export function pegRatio(pe: number | null, earningsGrowth: number | null): number | null {
  if (pe === null || pe <= 0 || earningsGrowth === null || earningsGrowth <= 0) return null;
  return pe / (earningsGrowth * 100);
}

export function ratePEG(peg: number | null): Rated | null {
  if (peg === null) return null;
  if (peg < 1) return r("good", "Growth more than justifies the P/E");
  if (peg <= 2) return r("neutral", "P/E roughly in line with growth");
  return r("bad", "P/E high for its growth");
}

export function ratePriceToSales(v: number | null): Rated | null {
  if (v === null || v <= 0) return null;
  if (v < 2) return r("good", "Low for its sales");
  if (v <= 8) return r("neutral", "Typical");
  return r("bad", "High for its sales");
}

export function ratePriceToBook(v: number | null): Rated | null {
  if (v === null || v <= 0) return null;
  if (v < 1.5) return r("good", "Near its asset value");
  if (v <= 5) return r("neutral", "Typical");
  return r("bad", "Well above its asset value");
}

export function rateEvToEbitda(v: number | null): Rated | null {
  if (v === null || v <= 0) return null;
  if (v < 10) return r("good", "Cheap (under 10)");
  if (v <= 20) return r("neutral", "Fair (10–20)");
  return r("bad", "Expensive (over 20)");
}

/** Today's P/E against the stock's own recent average */
export function ratePEvsHistory(pe: number | null, avg: number | null): Rated | null {
  if (pe === null || pe <= 0 || avg === null || avg <= 0) return null;
  const d = (pe - avg) / avg;
  if (d <= -0.1) return r("good", `${pct(-d)} below its usual P/E`);
  if (d <= 0.1) return r("neutral", "Near its usual P/E");
  return r("bad", `${pct(d)} above its usual P/E`);
}

export function rateAnalystUpside(upside: number | null): Rated | null {
  if (upside === null) return null;
  if (upside >= 0.1) return r("good", "Analysts see room to rise");
  if (upside >= -0.05) return r("neutral", "Near analysts' target");
  return r("bad", "Above analysts' target");
}

// ── Growth & profitability (higher is better) ──────────────────────────────

export function rateGrowth(v: number | null): Rated | null {
  if (v === null) return null;
  if (v >= 0.1) return r("good", "Growing fast");
  if (v >= 0) return r("neutral", "Growing slowly");
  return r("bad", "Shrinking");
}

export function rateGrossMargin(v: number | null): Rated | null {
  if (v === null) return null;
  if (v >= 0.4) return r("good", "Strong pricing power");
  if (v >= 0.2) return r("neutral", "Average");
  return r("bad", "Thin");
}

export function rateOperatingMargin(v: number | null): Rated | null {
  if (v === null) return null;
  if (v >= 0.15) return r("good", "Highly profitable");
  if (v >= 0.05) return r("neutral", "Modest");
  return r("bad", v < 0 ? "Losing money" : "Thin");
}

export function rateNetMargin(v: number | null): Rated | null {
  if (v === null) return null;
  if (v >= 0.1) return r("good", "Keeps a lot of each sale");
  if (v >= 0) return r("neutral", "Modest");
  return r("bad", "Losing money");
}

export function rateROE(v: number | null): Rated | null {
  if (v === null) return null;
  if (v >= 0.15) return r("good", "Uses capital well");
  if (v >= 0.05) return r("neutral", "Average");
  return r("bad", v < 0 ? "Losing money" : "Weak");
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
export function rateDebtToEquity(v: number | null): Rated | null {
  if (v === null) return null;
  if (v < 0) return r("bad", "Negative equity");
  if (v < 1) return r("good", "Low debt");
  if (v <= 2) return r("neutral", "Moderate debt");
  return r("bad", "Heavy debt");
}

export function rateCurrentRatio(v: number | null): Rated | null {
  if (v === null) return null;
  if (v >= 1.5) return r("good", "Bills well covered");
  if (v >= 1) return r("neutral", "Bills just covered");
  return r("bad", "Short-term bills exceed liquid assets");
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

export function rateRSI(v: number | null): Rated | null {
  if (v === null) return null;
  if (v >= 70) return r("bad", "Overbought: rose fast, may cool off");
  if (v >= 50) return r("good", "Positive momentum");
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
export function rateFromHigh(pctFromHigh: number | null): Rated | null {
  if (pctFromHigh === null) return null;
  if (pctFromHigh >= -10) return r("good", "Near its 1-year high");
  if (pctFromHigh >= -25) return r("neutral", "Pulled back from its high");
  return r("bad", "Far below its high");
}

// ── Risk (lower is better) ──────────────────────────────────────────────────

export function rateBeta(v: number | null): Rated | null {
  if (v === null) return null;
  if (v < 0.8) return r("good", "Calmer than the market");
  if (v <= 1.3) return r("neutral", "Moves with the market");
  return r("bad", "Swings more than the market");
}

export function rateVolatility(v: number | null): Rated | null {
  if (v === null) return null;
  if (v < 25) return r("good", "Steady");
  if (v <= 45) return r("neutral", "Average swings");
  return r("bad", "Very bumpy");
}

/** Max drawdown as a negative percent */
export function rateDrawdown(v: number | null): Rated | null {
  if (v === null) return null;
  if (v >= -15) return r("good", "Shallow dips");
  if (v >= -30) return r("neutral", "Normal dips");
  return r("bad", "Deep fall in the past year");
}

export function rateShortInterest(v: number | null): Rated | null {
  if (v === null) return null;
  if (v < 0.05) return r("good", "Few bets against it");
  if (v <= 0.1) return r("neutral", "Some bets against it");
  return r("bad", "Heavily shorted");
}

export function ratePayout(v: number | null): Rated | null {
  if (v === null || v <= 0) return null;
  if (v < 0.6) return r("good", "Dividend well covered");
  if (v <= 0.8) return r("neutral", "Dividend covered");
  return r("bad", "Dividend at risk if profits dip");
}

export function rateEarningsSoon(days: number | null): Rated | null {
  if (days === null || days < 0) return null;
  if (days <= 14) return r("neutral", "Price can jump either way on results");
  return null;
}

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
  const n = good + neutral + bad;
  return { good, neutral, bad, score: n ? (good - bad) / n : null };
}

/** Tone for a section score, matching the call thresholds */
export function signalTone(s: Signal): Rating | null {
  if (s.score === null) return null;
  return s.score >= CALL_THRESHOLD ? "good" : s.score <= -CALL_THRESHOLD ? "bad" : "neutral";
}

export type ScoredTab = "financials" | "valuation" | "technical" | "risks";
export type Call = "Buy" | "Hold" | "Sell";

/** How much each tab counts: long-term leans on the business, swing on the chart */
export const WEIGHTS: Record<"long-term" | "swing", Record<ScoredTab, number>> = {
  "long-term": { financials: 0.35, valuation: 0.3, technical: 0.15, risks: 0.2 },
  swing: { financials: 0.1, valuation: 0.1, technical: 0.55, risks: 0.25 },
};

export const CALL_THRESHOLD = 0.25;
const MIN_RATED = 6;

export function overallCall(
  signals: Record<ScoredTab, Signal>,
  strategy: "long-term" | "swing"
): { call: Call; score: number } | null {
  let total = 0, weight = 0, rated = 0;
  for (const tab of Object.keys(WEIGHTS[strategy]) as ScoredTab[]) {
    const s = signals[tab];
    rated += s.good + s.neutral + s.bad;
    if (s.score === null) continue;
    total += s.score * WEIGHTS[strategy][tab];
    weight += WEIGHTS[strategy][tab];
  }
  if (!weight || rated < MIN_RATED) return null;
  const score = total / weight;
  return { call: score >= CALL_THRESHOLD ? "Buy" : score <= -CALL_THRESHOLD ? "Sell" : "Hold", score };
}
