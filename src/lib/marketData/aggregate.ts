import { Candle } from "./types";
import { tradingDate } from "./time";

/**
 * Groups intraday bars into longer bars that never cross a trading day.
 *
 * Each day's groups are measured from that day's first bar, so 1-hour US bars become
 * 9:30–13:30 and 13:30–16:00. The last group of a session is shorter when the session
 * doesn't divide evenly, which is how most charting platforms build 4-hour stock bars.
 * A missing bar (no trades that hour) simply leaves fewer bars in a group.
 */
export function aggregateCandles(candles: Candle[], bucketSeconds: number, timeZone: string): Candle[] {
  const out: Candle[] = [];
  let day = "";
  let dayStart = 0;
  let bucket = -1;
  let current: Candle | null = null;

  for (const c of candles) {
    const d = tradingDate(c.time, timeZone);
    if (d !== day) {
      day = d;
      dayStart = c.time;
      bucket = -1;
    }
    const b = Math.floor((c.time - dayStart) / bucketSeconds);
    if (current && b === bucket) {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
      current.volume = addVolume(current.volume, c.volume);
    } else {
      if (current) out.push(current);
      current = { ...c };
      bucket = b;
    }
  }
  if (current) out.push(current);
  return out;
}

export function addVolume(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}
