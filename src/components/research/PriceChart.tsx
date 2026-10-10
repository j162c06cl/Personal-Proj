"use client";

import { useMemo } from "react";
import {
  Area, Bar, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChartRange, PricePoint } from "@/lib/types";

export const RANGE_LABELS: { value: ChartRange; label: string }[] = [
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
];

interface Row extends PricePoint {
  sma50: number | null;
  sma200: number | null;
}

function fmtTick(t: string, range: ChartRange) {
  const d = new Date(t + "T00:00:00");
  if (range === "5y") return d.toLocaleDateString("en-US", { year: "numeric" });
  if (range === "6mo" || range === "1y") return d.toLocaleDateString("en-US", { month: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// For multi-month ranges, tick on the first trading day of each month so labels never repeat
function monthTicks(rows: PricePoint[], range: ChartRange): string[] | undefined {
  if (range !== "6mo" && range !== "1y") return undefined;
  const step = range === "1y" ? 2 : 1;
  const out: string[] = [];
  let lastMonth = "";
  let n = 0;
  for (const r of rows) {
    const m = r.t.slice(0, 7);
    if (m !== lastMonth) {
      if (lastMonth && n++ % step === 0) out.push(r.t);
      lastMonth = m;
    }
  }
  return out;
}

export default function PriceChart({
  rows,
  range,
  showSma,
  showVolume,
  currencySymbol = "$",
}: {
  rows: Row[];
  range: ChartRange;
  showSma: boolean;
  showVolume: boolean;
  currencySymbol?: string;
}) {
  const up = rows.length > 1 && rows[rows.length - 1].c >= rows[0].c;
  const color = up ? "#22C55E" : "#EF4444";
  const changePct = rows.length > 1 ? ((rows[rows.length - 1].c - rows[0].c) / rows[0].c) * 100 : null;

  const maxVol = useMemo(() => Math.max(...rows.map((r) => r.v ?? 0)), [rows]);

  if (!rows.length) {
    return <div className="h-[300px] flex items-center justify-center text-[13px] text-[#A3A3A3]">No price history available.</div>;
  }

  return (
    <div>
      {changePct !== null && (
        <p className={`text-[13px] font-semibold mb-2 ${up ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
          {up ? "+" : ""}{changePct.toFixed(2)}% over this period
        </p>
      )}
      <ResponsiveContainer width="100%" height={showVolume ? 320 : 280}>
        <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis
            dataKey="t"
            ticks={monthTicks(rows, range)}
            tickFormatter={(t: string) => fmtTick(t, range)}
            tick={{ fontSize: 11, fill: "#A3A3A3" }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            yAxisId="p"
            orientation="right"
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => `${currencySymbol}${v >= 1000 ? v.toFixed(0) : v.toFixed(2)}`}
            tick={{ fontSize: 11, fill: "#A3A3A3" }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          {showVolume && <YAxis yAxisId="v" hide domain={[0, maxVol * 4]} />}
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #E5E5E5", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "8px 12px" }}
            labelFormatter={(t) => new Date(String(t) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            formatter={(v, name) => {
              const n = Number(v);
              if (name === "Volume") return [n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString(), name];
              return [`${currencySymbol}${n.toFixed(2)}`, name];
            }}
          />
          {showVolume && (
            <Bar yAxisId="v" dataKey="v" name="Volume" fill="#D4D4D4" fillOpacity={0.6} maxBarSize={6} isAnimationActive={false} />
          )}
          <Area
            yAxisId="p"
            type="monotone"
            dataKey="c"
            name="Close"
            stroke={color}
            strokeWidth={2}
            fill="url(#priceFill)"
            dot={false}
            isAnimationActive={false}
          />
          {showSma && (
            <Line yAxisId="p" type="monotone" dataKey="sma50" name="50-day avg" stroke="#1F65F0" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
          )}
          {showSma && (
            <Line yAxisId="p" type="monotone" dataKey="sma200" name="200-day avg" stroke="#F59E0B" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {showSma && (
        <div className="flex items-center gap-4 mt-1 text-[11px] text-[#525252]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#1F65F0] inline-block" />50-day average</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#F59E0B] inline-block" />200-day average</span>
        </div>
      )}
    </div>
  );
}
