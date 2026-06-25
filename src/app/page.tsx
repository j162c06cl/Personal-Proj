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
  const clr = d.changePercent === null ? "text-gray-400" : up ? "text-emerald-600" : "text-red-500";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm min-w-[148px] shrink-0">
      <p className="text-xs text-gray-500 mb-1 font-medium">{d.label}</p>
      <p className="text-lg font-bold text-gray-900">{fmtIndex(d.price, d.format)}</p>
      <p className={`text-xs font-semibold mt-0.5 ${clr}`}>
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Indices Today</h2>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 22 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
            angle={-20}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          <Tooltip
            formatter={(value) => [pct(Number(value ?? 0)), "Today"]}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={36}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.value >= 0 ? "#10b981" : "#ef4444"} fillOpacity={0.85} />
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

  const upcoming = UPCOMING_EVENTS.filter((e) => getDays(e.date) >= 0).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Market Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {lastUpdated
              ? `Updated ${new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
              : loading ? "Fetching live data..." : ""}
          </p>
        </div>
        <button
          onClick={loadMarket}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-50 font-medium"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Market Indices Cards */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Market Indices</h2>
        {err ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
            Could not load market data.{" "}
            <button onClick={loadMarket} className="underline font-medium">Retry</button>
          </div>
        ) : loading ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm min-w-[148px] shrink-0 animate-pulse">
                <div className="h-3 bg-gray-200 rounded mb-2 w-14" />
                <div className="h-6 bg-gray-200 rounded mb-1 w-20" />
                <div className="h-3 bg-gray-200 rounded w-10" />
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Stock heatmap — 2/3 width */}
        <div className="lg:col-span-2">
          <StockHeatmap />
        </div>

        {/* Right column: indices mini chart + upcoming events */}
        <div className="flex flex-col gap-4">
          {/* Indices % change chart */}
          {!loading && !err && indices.length > 0 && (
            <IndicesChart indices={indices} />
          )}

          {/* Upcoming Events */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Upcoming Events</h2>
              <Link href="/calendar" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                View all →
              </Link>
            </div>
            <div className="space-y-3">
              {upcoming.map((e) => {
                const days = getDays(e.date);
                return (
                  <div key={e.date + e.name} className="flex items-start gap-3">
                    <div className="shrink-0 bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-center min-w-[52px]">
                      <p className="text-xs font-bold text-gray-700">{fmtDate(e.date)}</p>
                      <p className="text-xs text-gray-400">{days === 0 ? "Today" : days === 1 ? "Tmrw" : `${days}d`}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{e.name}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{e.description}</p>
                    </div>
                    {e.importance === "high" && (
                      <span className="shrink-0 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium border border-red-200">
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
