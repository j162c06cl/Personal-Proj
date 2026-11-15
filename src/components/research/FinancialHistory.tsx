"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FinancialYear, PricePoint } from "@/lib/types";
import { historicalPE } from "@/lib/analysis";
import { formatBig } from "@/lib/markets";

// One metric per small chart: each has its own scale, so revenue never flattens margins.
// Single series per chart, so the accent hue alone carries identity and the title names it.

interface Metric {
  key: string;
  label: string;
  kind: "money" | "pct" | "ratio";
  value: (y: FinancialYear) => number | null;
}

const ratio = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? a / b : null);

const METRICS: Metric[] = [
  { key: "revenue", label: "Revenue", kind: "money", value: (y) => y.revenue },
  { key: "netIncome", label: "Net income", kind: "money", value: (y) => y.netIncome },
  { key: "fcf", label: "Free cash flow", kind: "money", value: (y) => y.freeCashFlow },
  { key: "netMargin", label: "Net margin", kind: "pct", value: (y) => ratio(y.netIncome, y.revenue) },
  { key: "opMargin", label: "Operating margin", kind: "pct", value: (y) => ratio(y.operatingIncome, y.revenue) },
  { key: "eps", label: "Diluted EPS", kind: "ratio", value: (y) => y.dilutedEps },
  { key: "debt", label: "Total debt", kind: "money", value: (y) => y.totalDebt },
  { key: "roe", label: "Return on equity", kind: "pct", value: (y) => ratio(y.netIncome, y.equity) },
];

const ACCENT = "#2D8CFF";

function fmt(kind: Metric["kind"], v: number | null, ccy: string | null) {
  if (v === null) return "—";
  if (kind === "pct") return `${(v * 100).toFixed(1)}%`;
  if (kind === "ratio") return v.toFixed(2);
  return formatBig(v, ccy);
}

function SmallChart({ metric, rows, ccy }: { metric: Metric; rows: { fy: string; v: number | null }[]; ccy: string | null }) {
  const data = rows.filter((r) => r.v !== null);
  const last = data[data.length - 1];
  const first = data[0];
  const change = last && first && data.length > 1 && first.v! > 0 && metric.kind === "money" ? (last.v! / first.v! - 1) : null;
  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold text-[#0A0A0A]">{metric.label}</span>
        <span className="text-[12px] tabular-nums text-[#525252]">
          {last ? fmt(metric.kind, last.v, ccy) : "—"}
          {change !== null && <span className={`ml-1 ${change >= 0 ? "text-[#00B341]" : "text-[#F04E23]"}`}>{change >= 0 ? "+" : ""}{(change * 100).toFixed(0)}% since {first.fy}</span>}
        </span>
      </figcaption>
      <div className="h-[110px] mt-1">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#F0F0F0" />
              <XAxis dataKey="fy" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#737373" }} />
              <YAxis hide domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} />
              <ReferenceLine y={0} stroke="#D4D4D4" />
              <Tooltip
                cursor={{ fill: "rgba(45,140,255,0.06)" }}
                formatter={(v) => [fmt(metric.kind, typeof v === "number" ? v : null, ccy), metric.label]}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #E5E5E5" }}
              />
              <Bar dataKey="v" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-[12px] text-[#A3A3A3] pt-8 text-center">Not reported</p>}
      </div>
    </figure>
  );
}

export default function FinancialHistory({
  years,
  currency,
  prices,
  pe,
}: {
  years: FinancialYear[];
  currency: string | null;
  /** Long price history, to compute P/E at each fiscal year end */
  prices?: PricePoint[];
  /** Today's trailing P/E, shown beside the history */
  pe?: number | null;
}) {
  const [view, setView] = useState<"charts" | "table">("charts");
  const peHist = useMemo(() => (prices?.length ? historicalPE(years, prices) : []), [years, prices]);
  const fyOf = (date: string) => `FY${date.slice(2, 4)}`;

  const metrics = METRICS.filter((m) => years.some((y) => m.value(y) !== null));
  const series = (m: Metric) => years.map((y) => ({ fy: fyOf(y.date), v: m.value(y) }));
  const peRows = years.map((y) => ({ fy: fyOf(y.date), v: peHist.find((h) => h.date === y.date)?.pe ?? null }));
  const peMetric: Metric = { key: "pe", label: "P/E at year end", kind: "ratio", value: () => null };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-[#525252]">
          Fiscal years {years[0]?.date.slice(0, 4)}–{years[years.length - 1]?.date.slice(0, 4)} · {currency ?? "reporting currency"}
          {pe != null && peHist.length > 0 && <> · P/E today <span className="font-semibold text-[#0A0A0A]">{pe.toFixed(1)}</span></>}
        </p>
        <div className="flex items-center rounded-full p-0.5" role="group" aria-label="View">
          {(["charts", "table"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded-full text-[12px] font-semibold capitalize ${view === v ? "bg-[#2D8CFF] text-white font-semibold" : "text-[#2D8CFF] hover:bg-[#EAF4FF]"}`}>{v}</button>
          ))}
        </div>
      </div>
      {view === "charts" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          {metrics.map((m) => <SmallChart key={m.key} metric={m} rows={series(m)} ccy={currency} />)}
          {peHist.length > 0 && <SmallChart metric={peMetric} rows={peRows} ccy={currency} />}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-[#E5E5E5] text-[11px] text-[#525252] uppercase tracking-wider">
                <th className="text-left py-2 pr-3 font-semibold">Metric</th>
                {years.map((y) => <th key={y.date} className="text-right py-2 px-2 font-semibold">FY{y.date.slice(0, 4)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {metrics.map((m) => (
                <tr key={m.key}>
                  <td className="py-2 pr-3 text-[#0A0A0A] font-medium">{m.label}</td>
                  {years.map((y) => <td key={y.date} className="text-right py-2 px-2 text-[#525252]">{fmt(m.kind, m.value(y), currency)}</td>)}
                </tr>
              ))}
              {peHist.length > 0 && (
                <tr>
                  <td className="py-2 pr-3 text-[#0A0A0A] font-medium">P/E at year end</td>
                  {years.map((y) => <td key={y.date} className="text-right py-2 px-2 text-[#525252]">{fmt("ratio", peHist.find((h) => h.date === y.date)?.pe ?? null, currency)}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
