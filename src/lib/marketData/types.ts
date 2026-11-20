// Types shared by the candle providers (server) and the chart (browser).
// Kept separate from PricePoint/ChartData in lib/types.ts, which only carry a date
// and so can't describe intraday bars.

export type Timeframe = "1d" | "4h" | "1h" | "15m" | "5m";

export interface TimeframeInfo {
  value: Timeframe;
  label: string;
  /** Length of one bar in seconds (a trading day for 1d) */
  seconds: number;
  intraday: boolean;
}

export const TIMEFRAMES: TimeframeInfo[] = [
  { value: "1d", label: "1D", seconds: 86_400, intraday: false },
  { value: "4h", label: "4H", seconds: 4 * 3_600, intraday: true },
  { value: "1h", label: "1H", seconds: 3_600, intraday: true },
  { value: "15m", label: "15m", seconds: 15 * 60, intraday: true },
  { value: "5m", label: "5m", seconds: 5 * 60, intraday: true },
];

export function timeframeInfo(tf: Timeframe): TimeframeInfo {
  return TIMEFRAMES.find((t) => t.value === tf)!;
}

export function isTimeframe(x: string | null | undefined): x is Timeframe {
  return TIMEFRAMES.some((t) => t.value === x);
}

/** Letters, digits and the symbols Yahoo uses: BRK-B, D05.SI, ^GSPC, EURUSD=X */
export function isValidTicker(t: string): boolean {
  return /^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/.test(t);
}

/**
 * One price bar. `time` is Unix seconds at the start of the bar. For daily bars it is
 * midnight UTC of the exchange's trading date instead, so a daily bar never lands on
 * the wrong day when viewed from another time zone.
 */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface CandleSeries {
  ticker: string;
  name: string | null;
  timeframe: Timeframe;
  currency: string;
  /** IANA time zone of the listing exchange, e.g. "America/New_York". Bar times are shown on this clock. */
  timeZone: string;
  candles: Candle[];
  /** Plain-language note on what history the provider gives at this timeframe */
  coverage: string;
}

/** A source of OHLCV bars. The chart only talks to this interface, so providers can be swapped. */
export interface CandleProvider {
  readonly name: string;
  supports(timeframe: Timeframe): boolean;
  /** Null when the provider has no data or the request failed */
  getCandles(ticker: string, timeframe: Timeframe): Promise<(CandleSeries & { asOf: string }) | null>;
}
