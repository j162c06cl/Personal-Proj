"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/formatters";
import StockHeatmap from "@/components/StockHeatmap";
import SourceTag from "@/components/SourceTag";
import TickerLink from "@/components/TickerLink";
import { timeAgo } from "@/components/research/NewsList";
import { getMarket, getQuotes, getTrending, MarketSnapshot, QuoteMap, TrendingFeed } from "@/lib/data";
import { ECONOMIC_EVENTS, calendarNotice, localToday } from "@/lib/economicEvents";
import { Sourced } from "@/lib/types";

type IndexData = MarketSnapshot["indices"][number];

const UPCOMING_COUNT = 2;
/** Warn when the hand-maintained release list ends within this many days */
const CALENDAR_WARN_DAYS = 30;

function fmtIndex(price: number | null, format: string): string {
  if (price === null) return "—";
  if (format === "currency") return formatCurrency(price);
  if (format === "percent") return `${price.toFixed(2)}%`;
  if (format === "decimal") return price.toFixed(2);
  return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v: number | null | undefined) => (v == null ? "text-[#A3A3A3]" : v >= 0 ? "text-[#00B341]" : "text-[#F04E23]");

function IndexCard({ d }: { d: IndexData }) {
  const up = (d.changePercent ?? 0) >= 0;
  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] hover:border-[#C8C8C8] min-w-[140px] flex-1 shrink-0 transition-colors">
      <p className="text-[11px] font-semibold text-[#525252] mb-1">{d.label}</p>
      <p className="text-[19px] font-bold tracking-tight tabular-nums text-[#0A0A0A]">{fmtIndex(d.price, d.format)}</p>
      <p className={`text-[12px] font-semibold mt-0.5 tabular-nums ${tone(d.changePercent)}`}>
        {d.changePercent !== null ? `${up ? "▲" : "▼"} ${Math.abs(d.changePercent).toFixed(2)}%` : "No data"}
      </p>
    </div>
  );
}

function getDays(d: string): number {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + "T00:00:00").getTime() - t.getTime()) / 86400000);
}

/** Regular US trading hours (9:30–16:00 New York, Mon–Fri); exchange holidays aren't modelled */
function usMarketOpen(now = new Date()): boolean {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  return day >= 1 && day <= 5 && mins >= 570 && mins < 960;
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-bold text-[#0A0A0A]">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => <div key={i} className="h-9 bg-black/[0.04] rounded-lg animate-pulse" />)}
    </div>
  );
}

export default function DashboardPage() {
  const [market, setMarket] = useState<Sourced<MarketSnapshot> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [trending, setTrending] = useState<Sourced<TrendingFeed> | null | undefined>(undefined);
  const [trendQuotes, setTrendQuotes] = useState<QuoteMap>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchAll = (force: boolean) => Promise.all([getMarket({ force }), getTrending({ force })]);

  function show([m, t]: Awaited<ReturnType<typeof fetchAll>>, force: boolean) {
    if (m) { setMarket(m); setErr(false); } else setErr(true);
    setTrending(t);
    if (t?.value.tickers.length) getQuotes(t.value.tickers, { force }).then(setTrendQuotes);
    setLoading(false);
  }

  /** Refresh and Retry: show the spinner, then fetch past the cache */
  function reload() {
    setLoading(true);
    setErr(false);
    fetchAll(true).then((r) => show(r, true));
  }

  // The page starts in the loading state, so the first fetch needs no state change up front
  useEffect(() => { fetchAll(false).then((r) => show(r, false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const indices = market?.value.indices ?? [];
  const upcoming = ECONOMIC_EVENTS.filter((e) => getDays(e.date) >= 0).slice(0, UPCOMING_COUNT);
  const calendarWarning = calendarNotice(localToday(), CALENDAR_WARN_DAYS);
  const open = usMarketOpen();

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-[#0A0A0A]">Market Overview</h1>
          <p className="text-[14px] text-[#525252] mt-1 flex items-center gap-2 flex-wrap">
            <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-0.5 rounded-full ${open ? "bg-[#E7F8EC] text-[#007A2B]" : "bg-[#F7F7F8] text-[#525252]"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${open ? "bg-[#00B341]" : "bg-[#A3A3A3]"}`} />
              US market {open ? "open" : "closed"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {market && (
            <span className="text-[12px] text-[#A3A3A3]">
              Updated {new Date(market.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => { reload(); setRefreshKey((k) => k + 1); }}
            disabled={loading}
            className="flex items-center gap-1.5 text-[14px] font-semibold text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#2D8CFF] hover:text-[#0A0A0A] px-4 py-2 rounded-xl disabled:opacity-50 transition-colors"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Indices */}
        <section>
          {err ? (
            <div className="bg-[#FFF0EB] border border-[#FFC9B8] rounded-2xl p-4 text-[13px] text-[#F04E23]">
              Could not load market data.{" "}
              <button onClick={reload} className="underline font-semibold">Retry</button>
            </div>
          ) : !market ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-[#E5E5E5] min-w-[140px] flex-1 shrink-0 animate-pulse">
                  <div className="h-2.5 bg-black/[0.06] rounded mb-3 w-14" />
                  <div className="h-5 bg-black/[0.06] rounded mb-2 w-20" />
                  <div className="h-2.5 bg-black/[0.06] rounded w-10" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {indices.map((d) => <IndexCard key={d.symbol} d={d} />)}
              </div>
              <div className="mt-2">
                <SourceTag source={market.source} asOf={market.asOf} cached={market.cached} />
              </div>
            </>
          )}
        </section>

        {/* Heatmap */}
        <StockHeatmap key={refreshKey} />

        {/* News, trending tickers, upcoming events */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2">
            <Card title="Trending news" right={trending && <SourceTag source={trending.source} asOf={trending.asOf} cached={trending.cached} />}>
              {trending === undefined ? <Skeleton rows={6} /> : !trending?.value.news.length ? (
                <p className="text-[13px] text-[#A3A3A3]">No market headlines available right now.</p>
              ) : (
                <ul className="divide-y divide-[#F0F0F0]">
                  {trending.value.news.slice(0, 8).map((n) => (
                    <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                      <a href={n.link} target="_blank" rel="noreferrer" className="text-[14px] font-semibold text-[#0A0A0A] hover:text-[#2D8CFF] leading-snug line-clamp-2">
                        {n.title}
                      </a>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className="text-[11px] text-[#525252]">
                          {n.publisher} · {timeAgo(n.publishedAt)}
                          {n.alsoReportedBy.length > 0 && <span className="text-[#A3A3A3]"> · +{n.alsoReportedBy.length} sources</span>}
                        </span>
                        {n.tickers.map((t) => (
                          <TickerLink key={t} ticker={t} className="text-[10px] font-bold text-[#2D8CFF] bg-[#EAF4FF] rounded px-1.5 py-0.5" />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card title="Trending tickers">
              {trending === undefined ? <Skeleton rows={2} /> : !trending?.value.tickers.length ? (
                <p className="text-[13px] text-[#A3A3A3]">Trending tickers are unavailable right now.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {trending.value.tickers.map((t) => {
                    const pct = trendQuotes[t]?.value.changePercent;
                    return (
                      <Link
                        key={t}
                        href={`/stock/${encodeURIComponent(t)}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[#E5E5E5] hover:border-[#2D8CFF] text-[12px] transition-colors"
                      >
                        <span className="font-bold text-[#0A0A0A]">{t}</span>
                        <span className={`font-semibold tabular-nums ${tone(pct)}`}>{pct == null ? "" : signed(pct)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card
              title="Upcoming events"
              right={<Link href="/calendar" className="text-[12px] font-semibold text-[#2D8CFF] hover:text-[#1A73E0]">View all →</Link>}
            >
              {calendarWarning && <p className="text-[11px] text-[#B45309] mb-3">{calendarWarning}</p>}
              {!upcoming.length ? (
                !calendarWarning && <p className="text-[13px] text-[#A3A3A3]">No scheduled releases. See the calendar for more.</p>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((e) => {
                    const days = getDays(e.date);
                    return (
                      <div key={e.date + e.name} className="flex items-start gap-3">
                        <div className="shrink-0 bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-2.5 py-1.5 text-center min-w-[56px]">
                          <p className="text-[11px] font-bold text-[#0A0A0A]">{new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          <p className="text-[10px] text-[#525252]">{days === 0 ? "Today" : days === 1 ? "Tmrw" : `${days}d`}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[#0A0A0A] leading-tight flex items-center gap-1.5">
                            {e.name}
                            {e.importance === "high" && (
                              <span className="text-[10px] font-semibold bg-[#FFF0EB] text-[#F04E23] px-1.5 py-0.5 rounded-lg border border-[rgba(239,68,68,0.2)]">High</span>
                            )}
                          </p>
                          <p className="text-[11px] text-[#525252] mt-0.5">{e.time} · {e.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
