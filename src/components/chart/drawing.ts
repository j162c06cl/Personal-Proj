// Shapes the chart draws for levels and the reader's drawings, already resolved to bar
// indexes for the bars on screen, plus the drawing tools.

export type DrawTool = "level" | "trendline" | "note";

export interface ChartPoint {
  /** Index into the chart's bars */
  index: number;
  price: number;
}

export interface ChartLevel {
  id: string;
  price: number;
  role: "support" | "resistance";
  /** Drawn by the reader rather than detected */
  manual: boolean;
  /** Short text beside the price label */
  title: string;
}

export interface ChartTrendline {
  id: string;
  a: ChartPoint;
  b: ChartPoint;
}

export interface ChartNoteMark {
  id: string;
  index: number;
  text: string;
}

export const DRAW_COLOR: [string, string] = ["--draw", "#0A0A0A"];
export const NOTE_COLOR: [string, string] = ["--draw-note", "#2D8CFF"];

/** A bar's time as shown on the chart: dates for daily bars, date and time for intraday */
export function formatBarTime(time: number, intraday: boolean) {
  const d = new Date(time * 1000);
  // Chart times are already on the exchange's clock, stored as if UTC
  return intraday
    ? d.toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}
