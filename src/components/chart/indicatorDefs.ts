import { IndicatorId } from "@/lib/marketData/indicators";

export type IndicatorGroup = "Moving averages" | "Volume" | "Momentum";

export interface IndicatorDef {
  id: IndicatorId;
  label: string;
  group: IndicatorGroup;
  /** Plain-language explanation shown in the menu and on hover in the readout */
  description: string;
  /** CSS variable holding the line colour, with the colour to use if it's missing */
  color: [cssVar: string, fallback: string];
  /** Only meaningful on intraday bars */
  intradayOnly?: boolean;
}

export const INDICATORS: IndicatorDef[] = [
  {
    id: "sma20", label: "SMA 20", group: "Moving averages", color: ["--ind-sma20", "#2D8CFF"],
    description: "Average close of the last 20 bars. Smooths out day-to-day noise to show the short-term trend.",
  },
  {
    id: "sma50", label: "SMA 50", group: "Moving averages", color: ["--ind-sma50", "#7C5CFC"],
    description: "Average close of the last 50 bars, a common gauge of the medium-term trend.",
  },
  {
    id: "sma200", label: "SMA 200", group: "Moving averages", color: ["--ind-sma200", "#F59E0B"],
    description: "Average close of the last 200 bars. On daily bars this is the widely watched long-term trend line.",
  },
  {
    id: "ema9", label: "EMA 9", group: "Moving averages", color: ["--ind-ema9", "#06B6D4"],
    description: "Exponential average of the last 9 bars. Recent prices count for more, so it turns faster than a simple average.",
  },
  {
    id: "ema21", label: "EMA 21", group: "Moving averages", color: ["--ind-ema21", "#EC4899"],
    description: "Exponential average of the last 21 bars, a faster-reacting medium-term trend line.",
  },
  {
    id: "vwap", label: "VWAP", group: "Volume", color: ["--ind-vwap", "#525252"], intradayOnly: true,
    description: "Volume-weighted average price: the average price paid so far this session, weighted by how much traded at each price. Restarts each session, so it's for intraday timeframes.",
  },
  {
    id: "avgVolume", label: "Average volume", group: "Volume", color: ["--ind-avgvol", "#737373"],
    description: "Average volume of the last 20 bars, drawn over the volume bars so unusually busy bars stand out.",
  },
  {
    id: "relVolume", label: "Relative volume", group: "Volume", color: ["--ind-relvol", "#525252"],
    description: "This bar's volume compared with normal: the previous 20 sessions on daily bars, or the same time of day over the previous 10 sessions intraday. 2× means twice the usual. The latest bar may still be trading.",
  },
  {
    id: "rsi", label: "RSI 14", group: "Momentum", color: ["--ind-rsi", "#7C5CFC"],
    description: "Relative Strength Index: momentum on a 0–100 scale over 14 bars. Above 70 is often called overbought and below 30 oversold, though strong trends can stay there.",
  },
  {
    id: "macd", label: "MACD 12, 26, 9", group: "Momentum", color: ["--ind-macd", "#2D8CFF"],
    description: "The gap between the 12- and 26-bar EMAs (blue), with its 9-bar average as a signal line (orange). The histogram shows the distance between them; MACD crossing above its signal is often read as momentum turning up.",
  },
];

export const MACD_SIGNAL_COLOR: [string, string] = ["--ind-macd-signal", "#F59E0B"];

export const DEFAULT_INDICATORS: IndicatorId[] = ["sma50", "sma200"];

/** Height of each RSI / MACD panel. The chart grows by this much per panel shown. */
export const PANEL_HEIGHT = 130;

/** How many panels below the price the switched-on indicators need */
export const panelCount = (on: ReadonlySet<IndicatorId>) => (on.has("rsi") ? 1 : 0) + (on.has("macd") ? 1 : 0);

export const indicatorDef = (id: IndicatorId) => INDICATORS.find((d) => d.id === id)!;

export function isIndicatorId(x: unknown): x is IndicatorId {
  return INDICATORS.some((d) => d.id === x);
}
