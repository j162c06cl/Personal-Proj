// Technical indicators computed client-side from daily price history.
import type { PricePoint } from "./types";

type Series = (number | null)[];

export function sma(values: number[], n: number): Series {
  const out: Series = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

export function ema(values: number[], n: number): Series {
  const out: Series = [];
  const k = 2 / (n + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    if (prev === null) prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
    else prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Wilder's RSI */
export function rsi(values: number[], n = 14): Series {
  const out: Series = values.map(() => null);
  if (values.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] !== null && s[i] !== null ? f[i]! - s[i]! : null));
  const start = line.findIndex((v) => v !== null);
  const sig: Series = values.map(() => null);
  if (start >= 0) {
    const e = ema(line.slice(start) as number[], signal);
    e.forEach((v, i) => { sig[start + i] = v; });
  }
  return { line, signal: sig };
}

export type Trend = "Uptrend" | "Downtrend" | "Mixed";

export interface Technicals {
  last: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  /** Direction of the most recent MACD/signal crossover within the last 10 bars */
  macdCross: { dir: "bullish" | "bearish"; barsAgo: number } | null;
  volumeRatio: number | null; // latest volume ÷ 50-day average
  high52: number | null;
  low52: number | null;
  pctFromHigh52: number | null;
  atrPct: number | null; // 14-day average true range as % of price
  low52Pct: number | null; // % above the 52-week low
  /** Lowest low and highest high of the last ~3 months (63 trading days) */
  support3m: number | null;
  resistance3m: number | null;
  /** Price returns in %, oldest bar on or before each lookback date to the latest close */
  returns: { m1: number | null; m3: number | null; m6: number | null; ytd: number | null; y1: number | null };
  /** Annualised standard deviation of daily returns, in % */
  volatility30: number | null;
  volatility1y: number | null;
  /** Largest peak-to-trough fall over the last year, in % (negative) */
  maxDrawdown1y: number | null;
  trend: Trend;
  bars: number;
}

const last = (s: Series) => (s.length ? s[s.length - 1] : null);

/** Expects daily bars, oldest first. ~1 year of data gives every indicator. */
export function computeTechnicals(points: PricePoint[]): Technicals | null {
  if (points.length < 30) return null;
  const closes = points.map((p) => p.c);
  const price = closes[closes.length - 1];

  const s20 = last(sma(closes, 20));
  const s50 = last(sma(closes, 50));
  const s200 = last(sma(closes, 200));
  const m = macd(closes);

  let macdCross: Technicals["macdCross"] = null;
  for (let i = closes.length - 1; i > closes.length - 11 && i > 0; i--) {
    const a = m.line[i], b = m.signal[i], pa = m.line[i - 1], pb = m.signal[i - 1];
    if (a === null || b === null || pa === null || pb === null) break;
    // Treat differences within floating-point noise as "equal", or a steady trend
    // (line == signal) followed by a turn would never register as a cross
    const eps = 1e-9 * Math.max(1, Math.abs(b));
    const d = a - b, pd = pa - pb;
    if (pd <= eps && d > eps) { macdCross = { dir: "bullish", barsAgo: closes.length - 1 - i }; break; }
    if (pd >= -eps && d < -eps) { macdCross = { dir: "bearish", barsAgo: closes.length - 1 - i }; break; }
  }

  const vols = points.map((p) => p.v ?? 0);
  const recentVols = vols.slice(-51, -1).filter((v) => v > 0);
  const avgVol = recentVols.length ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : null;
  const lastVol = vols[vols.length - 1];

  const yearBars = points.slice(-252);
  const quarterBars = points.slice(-63);
  const high52 = Math.max(...yearBars.map((p) => p.h ?? p.c));
  const low52 = Math.min(...yearBars.map((p) => p.l ?? p.c));

  const trs: number[] = [];
  for (let i = Math.max(1, points.length - 14); i < points.length; i++) {
    const p = points[i], prev = points[i - 1].c;
    const h = p.h ?? p.c, l = p.l ?? p.c;
    trs.push(Math.max(h - l, Math.abs(h - prev), Math.abs(l - prev)));
  }
  const atr = trs.reduce((a, b) => a + b, 0) / trs.length;

  let trend: Trend = "Mixed";
  if (s50 !== null && s200 !== null) {
    if (price > s50 && s50 > s200) trend = "Uptrend";
    else if (price < s50 && s50 < s200) trend = "Downtrend";
  } else if (s20 !== null && s50 !== null) {
    if (price > s20 && s20 > s50) trend = "Uptrend";
    else if (price < s20 && s20 < s50) trend = "Downtrend";
  }

  const vol = (days: number) => {
    const slice = closes.slice(-(days + 1));
    if (slice.length < Math.min(days, 20) + 1) return null;
    const rets = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
    return Math.sqrt(variance * 252) * 100;
  };

  let peak = -Infinity, maxDd = 0;
  for (const p of yearBars) {
    peak = Math.max(peak, p.c);
    maxDd = Math.min(maxDd, (p.c - peak) / peak);
  }

  return {
    last: price,
    sma20: s20,
    sma50: s50,
    sma200: s200,
    ema20: last(ema(closes, 20)),
    ema50: last(ema(closes, 50)),
    rsi14: last(rsi(closes)),
    macd: last(m.line),
    macdSignal: last(m.signal),
    macdCross,
    volumeRatio: avgVol && lastVol ? lastVol / avgVol : null,
    high52,
    low52,
    pctFromHigh52: ((price - high52) / high52) * 100,
    atrPct: (atr / price) * 100,
    low52Pct: ((price - low52) / low52) * 100,
    support3m: Math.min(...quarterBars.map((p) => p.l ?? p.c)),
    resistance3m: Math.max(...quarterBars.map((p) => p.h ?? p.c)),
    returns: periodReturns(points),
    volatility30: vol(30),
    volatility1y: vol(252),
    maxDrawdown1y: yearBars.length > 20 ? maxDd * 100 : null,
    trend,
    bars: points.length,
  };
}

/** SMA overlay series aligned to the given points, for the price chart. */
export function smaOverlay(points: PricePoint[], n: number): Series {
  return sma(points.map((p) => p.c), n);
}

/** % change from the last close on or before each lookback date to the latest close. */
export function periodReturns(points: PricePoint[]): Technicals["returns"] {
  const out: Technicals["returns"] = { m1: null, m3: null, m6: null, ytd: null, y1: null };
  if (points.length < 2) return out;
  const lastPt = points[points.length - 1];
  const end = new Date(`${lastPt.t}T00:00:00Z`);
  const from = (date: Date) => {
    const cut = date.toISOString().slice(0, 10);
    if (points[0].t > cut) return null; // not enough history
    let base: PricePoint | null = null;
    for (const p of points) { if (p.t <= cut) base = p; else break; }
    return base ? ((lastPt.c - base.c) / base.c) * 100 : null;
  };
  const monthsBack = (m: number) => { const d = new Date(end); d.setUTCMonth(d.getUTCMonth() - m); return d; };
  out.m1 = from(monthsBack(1));
  out.m3 = from(monthsBack(3));
  out.m6 = from(monthsBack(6));
  out.y1 = from(monthsBack(12));
  // Year to date: from the last close of the previous year
  out.ytd = from(new Date(Date.UTC(end.getUTCFullYear() - 1, 11, 31)));
  return out;
}
