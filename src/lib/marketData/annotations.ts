// What the reader draws on a chart: their own price levels, trendlines and notes.
// Levels are prices, so they show on every timeframe. Trendlines and notes are pinned to bars,
// so they only show on the timeframe they were drawn on. Times are the chart's bar times.

import { Timeframe, isTimeframe, isValidTicker } from "./types";

export interface ManualLevel {
  id: string;
  price: number;
  label: string;
}

export interface AnchorPoint {
  time: number;
  price: number;
}

export interface Trendline {
  id: string;
  timeframe: Timeframe;
  /** Earlier point first */
  a: AnchorPoint;
  b: AnchorPoint;
}

export interface ChartNote {
  id: string;
  timeframe: Timeframe;
  time: number;
  text: string;
}

export interface ChartAnnotations {
  levels: ManualLevel[];
  trendlines: Trendline[];
  notes: ChartNote[];
}

export const LABEL_MAX = 40;
export const NOTE_MAX = 280;

export const emptyAnnotations = (): ChartAnnotations => ({ levels: [], trendlines: [], notes: [] });

export const isEmptyAnnotations = (a: ChartAnnotations) => !a.levels.length && !a.trendlines.length && !a.notes.length;

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isPrice = (x: unknown): x is number => isNum(x) && x > 0;
const isId = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 64;
const isTf = (x: unknown): x is Timeframe => typeof x === "string" && isTimeframe(x);
const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const list = (x: unknown) => (Array.isArray(x) ? x.filter(isObj) : []);

function anchor(x: unknown): AnchorPoint | null {
  return isObj(x) && isNum(x.time) && isPrice(x.price) ? { time: x.time, price: x.price } : null;
}

/** Keeps only well-formed entries, so stored or imported data can never break the chart */
export function sanitizeAnnotations(raw: unknown): ChartAnnotations {
  if (!isObj(raw)) return emptyAnnotations();
  const levels = list(raw.levels).flatMap((l): ManualLevel[] =>
    isId(l.id) && isPrice(l.price) ? [{ id: l.id, price: l.price, label: text(l.label, LABEL_MAX) }] : []);
  const trendlines = list(raw.trendlines).flatMap((t): Trendline[] => {
    const a = anchor(t.a), b = anchor(t.b);
    if (!isId(t.id) || !isTf(t.timeframe) || !a || !b || a.time === b.time) return [];
    return [{ id: t.id, timeframe: t.timeframe, a: a.time < b.time ? a : b, b: a.time < b.time ? b : a }];
  });
  const notes = list(raw.notes).flatMap((n): ChartNote[] =>
    isId(n.id) && isTf(n.timeframe) && isNum(n.time) && typeof n.text === "string" && n.text.trim()
      ? [{ id: n.id, timeframe: n.timeframe, time: n.time, text: text(n.text, NOTE_MAX) }] : []);
  return { levels, trendlines, notes };
}

/** Every ticker's drawings, keyed by ticker; empty or invalid entries are dropped */
export function sanitizeAllAnnotations(raw: unknown): Record<string, ChartAnnotations> {
  const out: Record<string, ChartAnnotations> = {};
  if (!isObj(raw)) return out;
  for (const [ticker, value] of Object.entries(raw)) {
    if (!isValidTicker(ticker)) continue;
    const a = sanitizeAnnotations(value);
    if (!isEmptyAnnotations(a)) out[ticker] = a;
  }
  return out;
}

/**
 * Index of the bar at `time`, or of the nearest bar within `slack` seconds of it.
 * null when the time is outside the loaded bars (old intraday history rolls off).
 */
export function barIndexAt(times: readonly number[], time: number, slack: number): number | null {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0) return null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first bar at or after `time`; the one before may be closer
  const best = lo > 0 && Math.abs(times[lo - 1] - time) <= Math.abs(times[lo] - time) ? lo - 1 : lo;
  return Math.abs(times[best] - time) <= slack ? best : null;
}
