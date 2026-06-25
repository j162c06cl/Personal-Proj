"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/formatters";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import StockHeatmap from "@/components/StockHeatmap";

const UPCOMING_EVENTS = [
  { date: "2026-06-26", name: "GDP (Q1 Final)",       importance: "high",   description: "Final Q1 2026 economic growth estimate" },
  { date: "2026-06-27", name: "PCE Price Index",       importance: "high",   description: "Fed's preferred inflation measure (May)" },
  { date: "2026-07-02", name: "Non-Farm Payrolls",     importance: "high",   description: "June 2026 jobs report" },
  { date: "2026-07-14", name: "PPI (Jun)",             importance: "medium", description: "June 2026 Producer Price Index" },
  { date: "2026-07-15", name: "CPI (Jun)",             importance: "high",   description: "June 2026 Consumer Price Index" },
  { date: "2026-07-28", name: "FOMC Rate Decision",    importance: "high",   description: "Federal Reserve interest rate decision" },
  { date: "2026-07-30", name: "GDP (Q2 Advance)",      importance: "high",   description: "First Q2 2026 growth estimate" },
  { date: "2026-08-07", name: "Non-Farm Payrolls",     importance: "high",   description: "July 2026 jobs report" },
  { date: "2026-08-12", name: "CPI (Jul)",             importance: "high",   description: "July 2026 Consumer Price Index" },
  { date: "2026-09-15", name: "FOMC Rate Decision",    importance: "high",   description: "Federal Reserve interest rate decision" },
];

interface IndexData { symbol: string; label: string; format: string; price: number | null; change: number | null; changePercent: number | null; }
interface SectorData { symbol: string; label: string; price: number | null; change: number | null; changePercent: number | null; }

function fmtIndex(price: number | null, format: string): string {
  if (price === null) return "—";
  if (format === "currency") return formatCurrency(price);
  if (format === "percent") return `${price.toFixed(2)}%`;
  if (format === "decimal") return price.toFixed(2);
  return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function IndexCard({ d }: { d: IndexData }) {
  const up = (d.changePercent ?? 0) >= 0;
  const clr = d.changePercent === null ? "text-[#aeaeb2]" : up ? "text-[#34c759]" : "text-[#ff3b30]";
  return (
    <div className="bg-white rounded-[18px] p-[18px] shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.04)] min-w-[148px] shrink-0 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] transition-all duration-200 cursor-default">
      <p className="text-[11px] font-semibold text-[#6e6e73] mb-1.5">{d.label}</p>
      <p className="text-[21px] font-bold tracking-tight text-[#1d1d1f]">{fmtIndex(d.price, d.format)}</p>
      <p className={`text-[12px] font-semibold mt-1 ${clr}`}>
        {d.changePercent !== null ? `${up ? "▲" : "▼"} ${Math.abs(d.changePercent).toFixed(2)}%` : "No data"}
      </p>
    </div>
  );
}

function getDays(d: string): number {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + "T00:00:00").getTime() - t.getTime()) / 86400000);
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const EQUITY_SYMBOLS = ["^GSPC", "^IXIC", "^DJI", "^VIX"];

function IndicesChart({ indices }: { indices: IndexData[] }) {
  const data = indices
    .filter((d) => EQUITY_SYMBOLS.includes(d.symbol) && d.changePercent !== null)
    .map((d) => ({ label: d.label, value: parseFloat((d.changePercent ?? 0).toFixed(2)) }));

  if (!data.length) return null;

  return (
    <div className="bg-white rounded-[18px] shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.04)] p-5">
      <h2 className="text-[13px] font-semibold text-[#6e6e73] mb-3">Indices Today</h2>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 22 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#6e6e73" }}
            axisLine={false}
            tickLine={false}
            angle={-20}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
            tick={{ fontSize: 9, fill: "#aeaeb2" }}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          <Tooltip
            formatter={(value) => [pct(Number(value ?? 0)), "Today"]}
            contentStyle={{ fontSize: 11, borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.09), 0 0 1px rgba(0,0,0,0.05)", padding: "8px 12px" }}
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
          />
          <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.value >= 0 ? "#34c759" : "#ff3b30"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardPage() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  async function loadMarket() {
    setLoading(true); setErr(false);
    try {
      const r = await fetch("/api/market");
      const d = await r.json();
      setIndices(d.indices ?? []); setSectors(d.sectors ?? []); setLastUpdated(d.lastUpdated ?? null);
    } catch { setErr(true); }
    setLoading(false);
  }

  useEffect(() => { loadMarket(); }, []);

  // suppress unused warning
  void sectors;

  const upcoming = UPCOMING_EVENTS.filter((e) => getDays(e.date) >= 0).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#1d1d1f]">Market Dashboard</h1>
          <p className="text-[13px] text-[#6e6e73] mt-1">
            {lastUpdated
              ? `Updated ${new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
              : loading ? "Fetching live data…" : ""}
          </p>
        </div>
        <button
          onClick={loadMarket}
          disabled={loading}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0071e3] bg-[#e8f2ff] hover:bg-[#d4e9ff] px-4 py-2 rounded-[10px] disabled:opacity-50 transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Market Indices Cards */}
      <section>
        <h2 className="text-[13px] font-semibold text-[#6e6e73] mb-3">Market Indices</h2>
        {err ? (
          <div className="bg-[#fff0f0] rounded-2xl p-4 text-[13px] text-[#ff3b30]">
            Could not load market data.{" "}
            <button onClick={loadMarket} className="underline font-semibold">Retry</button>
          </div>
        ) : loading ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-[18px] p-[18px] shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.04)] min-w-[148px] shrink-0 animate-pulse">
                <div className="h-2.5 bg-black/[0.06] rounded mb-3 w-14" />
                <div className="h-6 bg-black/[0.06] rounded mb-2 w-20" />
                <div className="h-2.5 bg-black/[0.06] rounded w-10" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {indices.map((d) => <IndexCard key={d.symbol} d={d} />)}
          </div>
        )}
      </section>

      {/* Charts + Events grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {/* Stock heatmap — 2/3 → 3/4 width */}
        <div className="lg:col-span-2 xl:col-span-3">
          <StockHeatmap />
        </div>

        {/* Right column: indices mini chart + upcoming events */}
        <div className="flex flex-col gap-4">
          {!loading && !err && indices.length > 0 && (
            <IndicesChart indices={indices} />
          )}

          {/* Upcoming Events */}
          <div className="bg-white rounded-[18px] shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.04)] p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Upcoming Events</h2>
              <Link href="/calendar" className="text-[12px] font-medium text-[#0071e3] hover:opacity-75 transition-opacity">
                View all →
              </Link>
            </div>
            <div className="space-y-3">
              {upcoming.map((e) => {
                const days = getDays(e.date);
                return (
                  <div key={e.date + e.name} className="flex items-start gap-3">
                    <div className="shrink-0 bg-[#e8f2ff] rounded-[10px] px-2.5 py-1.5 text-center min-w-[52px]">
                      <p className="text-[11px] font-bold text-[#0071e3]">{fmtDate(e.date)}</p>
                      <p className="text-[10px] text-[#6e6e73]">{days === 0 ? "Today" : days === 1 ? "Tmrw" : `${days}d`}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#1d1d1f] leading-tight">{e.name}</p>
                      <p className="text-[11px] text-[#6e6e73] truncate mt-0.5">{e.description}</p>
                    </div>
                    {e.importance === "high" && (
                      <span className="shrink-0 text-[10px] font-semibold bg-[#fff0f0] text-[#ff3b30] px-1.5 py-0.5 rounded-[6px] border border-[rgba(255,59,48,0.15)]">
                        High
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
