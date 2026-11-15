"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getChart, QuoteMap } from "@/lib/data";
import { buildGrowthSeries, periodGain, rangeCovering } from "@/lib/portfolioHistory";
import { ChartRange, PortfolioPosition } from "@/lib/types";
import { useMoney } from "@/hooks/useSettings";
import SourceTag from "@/components/SourceTag";

type Period = "3M" | "6M" | "1Y" | "All";
const PERIODS: Period[] = ["3M", "6M", "1Y", "All"];
const FIXED: Record<Exclude<Period, "All">, ChartRange> = { "3M": "3mo", "6M": "6mo", "1Y": "1y" };

const VALUE = "#2D8CFF";
const INVESTED = "#A3A3A3";

/** Total portfolio value over time against the money put in */
/** `toUsd` converts each ticker's price history from its listing currency, so markets add up */
export default function GrowthChart({ positions, quotes, toUsd = {} }: { positions: PortfolioPosition[]; quotes: QuoteMap; toUsd?: Record<string, number> }) {
  const money = useMoney();
  const [period, setPeriod] = useState<Period>("All");
  const [prices, setPrices] = useState<Record<string, { t: string; c: number }[]> | null>(null);
  const [meta, setMeta] = useState<{ source: string; asOf: string; missing: string[] } | null>(null);

  const tickers = useMemo(() => Array.from(new Set(positions.map((p) => p.ticker))).sort(), [positions]);
  const firstBuy = useMemo(() => positions.reduce((m, p) => (!m || p.purchaseDate < m ? p.purchaseDate : m), ""), [positions]);
  const range: ChartRange = period === "All" ? rangeCovering(firstBuy || new Date().toISOString().slice(0, 10)) : FIXED[period];

  useEffect(() => {
    if (!tickers.length) return;
    let live = true;
    setPrices(null);
    Promise.all(tickers.map(async (t) => [t, await getChart(t, range)] as const)).then((rows) => {
      if (!live) return;
      const ok = rows.filter(([, c]) => c?.value.points.length);
      setPrices(Object.fromEntries(ok.map(([t, c]) => [t, c!.value.points.map((p) => ({ t: p.t, c: p.c }))])));
      const newest = ok.reduce<(typeof ok)[number][1]>((m, [, c]) => (!m || (c && c.asOf > m.asOf) ? c : m), null);
      setMeta({
        source: newest?.source ?? "",
        asOf: newest?.asOf ?? "",
        missing: rows.filter(([, c]) => !c?.value.points.length).map(([t]) => t),
      });
    });
    return () => { live = false; };
  }, [tickers.join(","), range]); // eslint-disable-line react-hooks/exhaustive-deps

  const points = useMemo(() => {
    if (!prices) return [];
    const latest = Object.fromEntries(tickers.map((t) => [t, quotes[t]?.value.price ?? null]));
    const usd = Object.fromEntries(Object.entries(prices).map(([t, pts]) => [t, toUsd[t] && toUsd[t] !== 1 ? pts.map((p) => ({ t: p.t, c: p.c * toUsd[t] })) : pts]));
    return buildGrowthSeries(positions, usd, { latest, today: new Date().toISOString().slice(0, 10) })
      .map((p) => ({ ...p, valueC: money.convert(p.value)!, investedC: money.convert(p.invested)! }));
  }, [prices, positions, quotes, tickers, money.currency, toUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  const end = points.at(-1);
  const startedInRange = points.length > 0 && firstBuy >= points[0].t;
  // From the first purchase the gain is simply value minus money in, matching Total return
  const gain = startedInRange && end ? end.value - end.invested : periodGain(points);
  const sym = money.currency === "SGD" ? "S$" : "$";
  const short = (v: number) => (Math.abs(v) >= 1e6 ? `${sym}${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${sym}${(v / 1e3).toFixed(0)}k` : `${sym}${v.toFixed(0)}`);
  const spanDays = points.length > 1 ? (new Date(points.at(-1)!.t).getTime() - new Date(points[0].t).getTime()) / 86_400_000 : 0;
  const tickFmt = (t: string) => new Date(t + "T00:00:00").toLocaleDateString("en-US", spanDays > 400 ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" });

  return (
    <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-[15px] font-bold text-[#0A0A0A]">Portfolio growth</h2>
          {end && gain !== null ? (
            <p className="text-[13px] text-[#525252] mt-0.5">
              <span className={`font-semibold tabular-nums ${gain >= 0 ? "text-[#00B341]" : "text-[#F04E23]"}`}>
                {gain >= 0 ? "+" : "−"}{money.fmt(Math.abs(gain))}
              </span>{" "}
              {period === "All" && startedInRange ? "since your first purchase" : `over ${period === "All" ? "the last 5 years" : `the last ${period}`}`}, not counting money you added
            </p>
          ) : (
            <p className="text-[13px] text-[#525252] mt-0.5">Value of your holdings against the money you put in</p>
          )}
        </div>
        <div className="flex items-center rounded-full p-0.5 gap-0.5" role="group" aria-label="Time period">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-all ${period === p ? "bg-[#2D8CFF] text-white font-semibold" : "text-[#2D8CFF] hover:bg-[#EAF4FF]"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Legend (two series, so identity never relies on colour alone) */}
      <div className="flex items-center gap-4 mb-2 text-[12px] text-[#525252]">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: VALUE }} />Portfolio value</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: INVESTED }} />Money invested</span>
      </div>

      <div className="h-[280px]">
        {!prices ? (
          <div className="h-full bg-black/[0.03] rounded-xl animate-pulse" />
        ) : points.length < 2 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-[#A3A3A3]">Not enough price history to draw this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VALUE} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={VALUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="t" tickFormatter={tickFmt} tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} width={52} domain={["auto", "auto"]} />
              <Tooltip
                cursor={{ stroke: "#D4D4D4", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload as (typeof points)[number] | undefined;
                  if (!p) return null;
                  const diff = p.value - p.invested;
                  return (
                    <div className="bg-white border border-[#E5E5E5] rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-3 py-2 text-[12px]">
                      <p className="font-semibold text-[#0A0A0A] mb-1">{new Date(p.t + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                      <p className="text-[#525252]">Value <span className="font-semibold text-[#0A0A0A] tabular-nums">{money.fmt(p.value)}</span></p>
                      <p className="text-[#525252]">Invested <span className="font-semibold text-[#0A0A0A] tabular-nums">{money.fmt(p.invested)}</span></p>
                      <p className="text-[#525252]">Gain <span className={`font-semibold tabular-nums ${diff >= 0 ? "text-[#00B341]" : "text-[#F04E23]"}`}>{diff >= 0 ? "+" : "−"}{money.fmt(Math.abs(diff))}</span></p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="valueC" stroke={VALUE} strokeWidth={2} fill="url(#growthFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="investedC" stroke={INVESTED} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-2">
        {meta?.source && <SourceTag source={`Calculated from ${meta.source} closing prices`} asOf={meta.asOf} />}
        {meta && meta.missing.length > 0 && (
          <span className="text-[11px] text-[#B45309]">No price history for {meta.missing.join(", ")}; counted at purchase price.</span>
        )}
      </div>
    </div>
  );
}
