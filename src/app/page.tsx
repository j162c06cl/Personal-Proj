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
import SourceTag from "@/components/SourceTag";
import { getMarket } from "@/lib/data";

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
  const clr = d.changePercent === null ? "text-[#A3A3A3]" : up ? "text-[#22C55E]" : "text-[#EF4444]";
  return (
    <div className="bg-white rounded-2xl p-[18px] border border-[#E5E5E5] hover:border-[#C8C8C8] hover:shadow-[0_2px_12px_rgba(0,0,0,0.07)] min-w-[148px] shrink-0 transition-all duration-200 cursor-default">
      <p className="text-[11px] font-semibold text-[#525252] mb-1.5">{d.label}</p>
      <p className="text-[21px] font-bold tracking-tight text-[#0A0A0A]">{fmtIndex(d.price, d.format)}</p>
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
    <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
      <h2 className="text-[13px] font-semibold text-[#525252] mb-3">Indices Today</h2>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 22 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#525252" }}
            axisLine={false}
            tickLine={false}
            angle={-20}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
            tick={{ fontSize: 9, fill: "#A3A3A3" }}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          <Tooltip
            formatter={(value) => [pct(Number(value ?? 0)), "Today"]}
            contentStyle={{ fontSize: 11, borderRadius: 12, border: "1px solid #E5E5E5", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: "8px 12px" }}
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
          />
          <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.value >= 0 ? "#22C55E" : "#EF4444"} fillOpacity={0.9} />
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
  const [marketSource, setMarketSource] = useState<{ source: string; cached: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  async function loadMarket(force = false) {
    setLoading(true); setErr(false);
    const d = await getMarket({ force });
    if (d) {
      setIndices(d.value.indices); setSectors(d.value.sectors); setLastUpdated(d.asOf);
      setMarketSource({ source: d.source, cached: d.cached });
    } else setErr(true);
    setLoading(false);
  }

  useEffect(() => { loadMarket(); }, []);

  void sectors;

  const upcoming = UPCOMING_EVENTS.filter((e) => getDays(e.date) >= 0).slice(0, 5);

  return (
    <div>
      {/* Dark Hero Banner */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-6 bg-[#111111] px-4 sm:px-6 lg:px-8 pt-10 pb-11 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <h1 className="text-[40px] sm:text-[52px] font-black text-white tracking-tight leading-none">
              Market Dashboard
            </h1>
            <p className="text-[15px] text-[#888888] mt-3 max-w-md leading-relaxed">
              Real-time indices, sector heatmap, and upcoming economic events.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <button
              onClick={() => loadMarket(true)}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1F65F0] text-white text-[14px] font-semibold rounded-xl hover:bg-[#1550D8] disabled:opacity-50 transition-colors"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Data
            </button>
            {lastUpdated && (
              <span className="text-[13px] text-[#666666]">
                Updated {new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Market Indices Cards */}
        <section>
          <h2 className="text-[13px] font-semibold text-[#525252] mb-3 uppercase tracking-wider">Market Indices</h2>
          {err ? (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-2xl p-4 text-[13px] text-[#EF4444]">
              Could not load market data.{" "}
              <button onClick={() => loadMarket(true)} className="underline font-semibold">Retry</button>
            </div>
          ) : loading ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-[18px] border border-[#E5E5E5] min-w-[148px] shrink-0 animate-pulse">
                  <div className="h-2.5 bg-black/[0.06] rounded mb-3 w-14" />
                  <div className="h-6 bg-black/[0.06] rounded mb-2 w-20" />
                  <div className="h-2.5 bg-black/[0.06] rounded w-10" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {indices.map((d) => <IndexCard key={d.symbol} d={d} />)}
              </div>
              {marketSource && (
                <SourceTag className="mt-2" source={marketSource.source} asOf={lastUpdated} cached={marketSource.cached} />
              )}
            </>
          )}
        </section>

        {/* Charts + Events grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {/* Stock heatmap */}
          <div className="lg:col-span-2 xl:col-span-3">
            <StockHeatmap />
          </div>

          {/* Right column: indices mini chart + upcoming events */}
          <div className="flex flex-col gap-4">
            {!loading && !err && indices.length > 0 && (
              <IndicesChart indices={indices} />
            )}

            {/* Upcoming Events */}
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[15px] font-semibold text-[#0A0A0A]">Upcoming Events</h2>
                <Link href="/calendar" className="text-[12px] font-semibold text-[#1F65F0] hover:text-[#1550D8] transition-colors">
                  View all →
                </Link>
              </div>
              <div className="space-y-3">
                {upcoming.map((e) => {
                  const days = getDays(e.date);
                  return (
                    <div key={e.date + e.name} className="flex items-start gap-3">
                      <div className="shrink-0 bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-2.5 py-1.5 text-center min-w-[52px]">
                        <p className="text-[11px] font-bold text-[#0A0A0A]">{fmtDate(e.date)}</p>
                        <p className="text-[10px] text-[#525252]">{days === 0 ? "Today" : days === 1 ? "Tmrw" : `${days}d`}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#0A0A0A] leading-tight">{e.name}</p>
                        <p className="text-[11px] text-[#525252] truncate mt-0.5">{e.description}</p>
                      </div>
                      {e.importance === "high" && (
                        <span className="shrink-0 text-[10px] font-semibold bg-[#FEF2F2] text-[#EF4444] px-1.5 py-0.5 rounded-lg border border-[rgba(239,68,68,0.2)]">
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
    </div>
  );
}
