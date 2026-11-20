"use client";

import { IndicatorId, IndicatorValues } from "@/lib/marketData/indicators";
import { formatVolume } from "@/lib/formatters";
import { INDICATORS, MACD_SIGNAL_COLOR } from "./indicatorDefs";

const swatch = (c: [string, string]) => `var(${c[0]}, ${c[1]})`;

/**
 * Values of the switched-on indicators for the bar under the crosshair (or the latest bar).
 * "—" means there aren't enough bars before this one to calculate it yet.
 */
export default function IndicatorLegend({
  values,
  enabled,
  index,
  intraday,
  priceDigits,
  symbol,
}: {
  values: IndicatorValues;
  enabled: ReadonlySet<IndicatorId>;
  index: number;
  intraday: boolean;
  priceDigits: number;
  symbol: string;
}) {
  const shown = INDICATORS.filter((d) => enabled.has(d.id) && !(d.intradayOnly && !intraday));
  if (!shown.length) return null;

  const at = (s: (number | null)[] | undefined) => s?.[index] ?? null;
  const num = (v: number | null, fmt: (n: number) => string) => (v === null ? "—" : fmt(v));
  const price = (v: number) => `${symbol}${v.toFixed(priceDigits)}`;

  function value(id: IndicatorId): React.ReactNode {
    switch (id) {
      case "avgVolume": return num(at(values.avgVolume), formatVolume);
      case "relVolume": return num(at(values.relVolume), (v) => `${v.toFixed(1)}×`);
      case "rsi": return num(at(values.rsi), (v) => v.toFixed(1));
      case "macd": {
        const m = values.macd;
        const f = (v: number | null) => num(v, (n) => n.toFixed(priceDigits));
        return (
          <>
            {f(at(m?.line))} <span className="text-[#A3A3A3]">Signal</span>{" "}
            <span style={{ color: swatch(MACD_SIGNAL_COLOR) }}>{f(at(m?.signal))}</span>{" "}
            <span className="text-[#A3A3A3]">Hist</span> <span className="text-[#525252]">{f(at(m?.histogram))}</span>
          </>
        );
      }
      default: return num(at(values[id]), price);
    }
  }

  return (
    <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap text-[12px] tabular-nums">
      {shown.map((d) => (
        <span key={d.id} className="text-[#A3A3A3] cursor-help" title={d.description}>
          {d.label}{" "}
          <span className="font-medium" style={{ color: swatch(d.color) }}>{value(d.id)}</span>
        </span>
      ))}
    </div>
  );
}
