"use client";

import { Candle, Timeframe, timeframeInfo } from "@/lib/marketData/types";
import { formatPercent, formatVolume } from "@/lib/formatters";

/** When the bar opened, on the exchange's clock for intraday bars */
function barLabel(c: Candle, timeframe: Timeframe, timeZone: string) {
  const d = new Date(c.time * 1000);
  if (!timeframeInfo(timeframe).intraday) {
    return d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  return d.toLocaleString("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

/**
 * Open, high, low, close and volume for the bar under the crosshair (or the latest bar),
 * with the change from the previous bar's close.
 */
export default function OhlcvLegend({
  candle,
  prev,
  timeframe,
  timeZone,
  symbol,
}: {
  candle: Candle;
  prev: Candle | null;
  timeframe: Timeframe;
  timeZone: string;
  symbol: string;
}) {
  const digits = candle.close < 1 ? 3 : 2;
  const px = (n: number) => `${symbol}${n.toFixed(digits)}`;
  const change = prev ? ((candle.close - prev.close) / prev.close) * 100 : null;
  const up = change !== null && change >= 0;
  const tone = change === null ? "text-[#525252]" : up ? "text-[#00B341]" : "text-[#F04E23]";

  return (
    <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap text-[12px] tabular-nums min-h-[36px] sm:min-h-0">
      <span className="font-semibold text-[#0A0A0A]">{barLabel(candle, timeframe, timeZone)}</span>
      {([["O", candle.open], ["H", candle.high], ["L", candle.low], ["C", candle.close]] as const).map(([k, v]) => (
        <span key={k} className="text-[#A3A3A3]">
          {k} <span className={`font-medium ${tone}`}>{px(v)}</span>
        </span>
      ))}
      <span className={`font-semibold ${tone}`} title="Change from the previous bar's close">
        {change === null ? "—" : formatPercent(change)}
      </span>
      <span className="text-[#A3A3A3]">
        Vol <span className="font-medium text-[#525252]">{formatVolume(candle.volume)}</span>
      </span>
    </div>
  );
}
