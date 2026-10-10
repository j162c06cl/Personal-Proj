"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getFundamentals, getNews, getQuotes, MarketSnapshot, QuoteMap } from "@/lib/data";
import { loadPortfolio } from "@/lib/store";
import { ECONOMIC_EVENTS } from "@/lib/economicEvents";
import { Fundamentals, NewsItem, PortfolioPosition, Sourced } from "@/lib/types";
import { useMoney, useSettings } from "@/hooks/useSettings";
import TickerLink from "@/components/TickerLink";
import SourceTag from "@/components/SourceTag";
import { timeAgo } from "@/components/research/NewsList";

const MOVE_THRESHOLD = 2;    // % move that counts as significant
const VOLUME_THRESHOLD = 1.5; // × average volume that counts as unusual
const LOOKAHEAD_DAYS = 30;

// ── helpers ─────────────────────────────────────────────────────────────────

const localDate = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00` : s);

function daysUntil(s: string) {
  const d = localDate(s); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

const signed = (v: number, digits = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
const tone = (v: number) => (v >= 0 ? "text-[#16A34A]" : "text-[#DC2626]");

function Card({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E5E5] p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-[15px] font-bold text-[#0A0A0A]">{title}</h3>
          {subtitle && <p className="text-[12px] text-[#525252] mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="flex-1">{children}</div>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-[#A3A3A3]">{children}</p>;
}

// ── component ───────────────────────────────────────────────────────────────

interface UpcomingItem {
  key: string;
  date: string;
  title: string;
  ticker?: string;
  detail: string;
  kind: "earnings" | "dividend" | "macro";
}

export default function YourDay({ market }: { market: MarketSnapshot | null }) {
  const { settings } = useSettings();
  const money = useMoney();
  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [quotes, setQuotes] = useState<QuoteMap | null>(null);
  const [funds, setFunds] = useState<Record<string, Sourced<Fundamentals> | null> | null>(null);
  const [news, setNews] = useState<{ ticker: string; item: NewsItem }[] | null>(null);
  const [newsSource, setNewsSource] = useState<Sourced<unknown> | null>(null);

  useEffect(() => { loadPortfolio().then(setPositions); }, []);

  const tickers = useMemo(() => Array.from(new Set((positions ?? []).map((p) => p.ticker))), [positions]);
  const nameOf = useMemo(() => Object.fromEntries((positions ?? []).map((p) => [p.ticker, p.name])), [positions]);

  useEffect(() => {
    if (!tickers.length) return;
    getQuotes(tickers).then(setQuotes);
    Promise.all(tickers.map(async (t) => [t, await getFundamentals(t)] as const)).then((r) => setFunds(Object.fromEntries(r)));
    Promise.all(tickers.map(async (t) => ({ t, feed: await getNews(t, nameOf[t]) }))).then((results) => {
      setNewsSource(results.find((r) => r.feed)?.feed ?? null);
      // Only stories whose headline names the company; the rest is market noise for this purpose
      const seen = new Set<string>();
      const items: { ticker: string; item: NewsItem }[] = [];
      for (const { t, feed } of results) {
        for (const item of feed?.value.items ?? []) {
          if (item.relevance !== "direct" || seen.has(item.link)) continue;
          seen.add(item.link);
          items.push({ ticker: t, item });
        }
      }
      items.sort((a, b) => b.item.publishedAt.localeCompare(a.item.publishedAt));
      setNews(items);
    });
  }, [tickers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── portfolio totals ──
  const totals = useMemo(() => {
    if (!positions || !quotes) return null;
    let value = 0, dayChange = 0, cost = 0, priced = 0;
    let latestAsOf = "";
    let source = "";
    for (const p of positions) {
      const q = quotes[p.ticker];
      cost += p.purchasePrice * p.quantity;
      if (!q || q.value.price === null) { value += p.purchasePrice * p.quantity; continue; }
      priced++;
      value += q.value.price * p.quantity;
      dayChange += (q.value.change ?? 0) * p.quantity;
      if (q.asOf > latestAsOf) { latestAsOf = q.asOf; source = q.source; }
    }
    const prev = value - dayChange;
    return {
      value,
      dayChange,
      dayPct: prev > 0 ? (dayChange / prev) * 100 : 0,
      totalPL: value - cost,
      totalPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
      priced,
      latestAsOf,
      source,
    };
  }, [positions, quotes]);

  // Weekends / pre-market: the latest prices are from an earlier session, so say which one.
  // Sessions are named by their New York trading date (Friday's close is Saturday morning in Asia).
  const sessionLabel = useMemo(() => {
    if (!totals?.latestAsOf) return "Today";
    const ny = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", ...o });
    const session = new Date(totals.latestAsOf);
    if (ny(session, {}) === ny(new Date(), {})) return "Today";
    return `Last session (${ny(session, { weekday: "short", month: "short", day: "numeric" })})`;
  }, [totals?.latestAsOf]);

  // ── movers ──
  const movers = useMemo(() => {
    if (!positions || !quotes) return null;
    return tickers
      .map((t) => {
        const q = quotes[t]?.value;
        const qty = positions.filter((p) => p.ticker === t).reduce((s, p) => s + p.quantity, 0);
        const volRatio = q?.volume && q?.avgVolume ? q.volume / q.avgVolume : null;
        return { t, pct: q?.changePercent ?? null, dollar: (q?.change ?? 0) * qty, volRatio };
      })
      .filter((m) => m.pct !== null && (Math.abs(m.pct) >= MOVE_THRESHOLD || (m.volRatio ?? 0) >= VOLUME_THRESHOLD))
      .sort((a, b) => Math.abs(b.pct!) - Math.abs(a.pct!));
  }, [positions, quotes, tickers]);

  // ── upcoming events for holdings + next macro releases ──
  const upcoming = useMemo((): UpcomingItem[] | null => {
    if (!funds) return null;
    const out: UpcomingItem[] = [];
    for (const [t, f] of Object.entries(funds)) {
      const ev = f?.value.events;
      if (!ev) continue;
      if (ev.earningsDate) {
        out.push({
          key: `${t}-earn`, date: ev.earningsDate, title: "Earnings", ticker: t, kind: "earnings",
          detail: `${ev.earningsIsEstimate ? "Estimated" : "Confirmed"}${ev.epsEstimate !== null ? ` · EPS est. $${ev.epsEstimate.toFixed(2)}` : ""}`,
        });
      }
      if (ev.exDividendDate) {
        out.push({ key: `${t}-exdiv`, date: ev.exDividendDate, title: "Ex-dividend", ticker: t, kind: "dividend", detail: "Own before this date for the next payout" });
      }
    }
    for (const e of ECONOMIC_EVENTS.filter((e) => e.importance === "high")) {
      out.push({ key: `macro-${e.date}-${e.name}`, date: e.date, title: e.name, kind: "macro", detail: e.description });
    }
    return out
      .filter((e) => { const d = daysUntil(e.date); return d >= 0 && d <= LOOKAHEAD_DAYS; })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 7);
  }, [funds]);

  // ── sectors from the investor profile ──
  const watchedSectors = useMemo(() => {
    const wanted = settings?.profile.sectors ?? [];
    if (!wanted.length || !market) return [];
    return market.sectors.filter((s) => wanted.includes(s.label));
  }, [settings, market]);

  // ── render ──
  if (positions === null) return <Skeleton rows={4} />;

  if (!positions.length) {
    return (
      <div className="bg-white rounded-2xl border border-[#E5E5E5] p-8 text-center">
        <p className="text-[15px] font-semibold text-[#0A0A0A]">Add your holdings to see your day</p>
        <p className="text-[13px] text-[#525252] mt-1">Your portfolio&apos;s moves, news and upcoming earnings will appear here.</p>
        <Link href="/portfolio" className="inline-block mt-4 px-4 py-2 bg-[#1F65F0] text-white text-[13px] font-semibold rounded-xl hover:bg-[#1550D8]">
          Go to Portfolio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Portfolio value", value: totals ? money.fmt(totals.value) : null, sub: totals ? `${totals.priced} of ${positions.length} positions priced` : "", cls: "text-[#0A0A0A]" },
          {
            label: sessionLabel,
            value: totals ? `${totals.dayChange >= 0 ? "+" : "−"}${money.fmt(Math.abs(totals.dayChange))}` : null,
            sub: totals ? signed(totals.dayPct) : "",
            cls: totals ? tone(totals.dayChange) : "",
          },
          {
            label: "Total return",
            value: totals ? `${totals.totalPL >= 0 ? "+" : "−"}${money.fmt(Math.abs(totals.totalPL))}` : null,
            sub: totals ? `${signed(totals.totalPct)} on cost` : "",
            cls: totals ? tone(totals.totalPL) : "",
          },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-[#E5E5E5] p-5">
            <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">{c.label}</p>
            {c.value === null ? (
              <div className="h-8 w-32 mt-1.5 bg-black/[0.05] rounded animate-pulse" />
            ) : (
              <>
                <p className={`text-[26px] font-bold tabular-nums tracking-tight mt-1 ${c.cls}`}>{c.value}</p>
                <p className={`text-[13px] font-semibold ${c.label === "Portfolio value" ? "text-[#525252] font-medium" : c.cls}`}>{c.sub}</p>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap -mt-2">
        {totals?.source && <SourceTag source={`Prices: ${totals.source}`} asOf={totals.latestAsOf} />}
        {money.fx && <SourceTag source={`FX 1 US$ = S$${money.fx.value.toFixed(4)}`} asOf={money.fx.asOf} />}
        <Link href="/portfolio" className="text-[12px] font-semibold text-[#1F65F0] hover:underline">Full portfolio →</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Movers */}
        <Card title="Holdings that moved" subtitle={`±${MOVE_THRESHOLD}% or more, or ${VOLUME_THRESHOLD}× normal volume`}>
          {movers === null ? <Skeleton /> : !movers.length ? (
            <Empty>None of your holdings moved more than {MOVE_THRESHOLD}% or traded on unusual volume.</Empty>
          ) : (
            <ul className="divide-y divide-[#F0F0F0]">
              {movers.map((m) => (
                <li key={m.t} className="flex items-center justify-between py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <TickerLink ticker={m.t} />
                    <p className="text-[11px] text-[#A3A3A3] truncate">{nameOf[m.t]}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[14px] font-bold tabular-nums ${tone(m.pct!)}`}>{signed(m.pct!)}</p>
                    <p className="text-[11px] text-[#525252] tabular-nums">
                      {m.dollar >= 0 ? "+" : "−"}{money.fmt(Math.abs(m.dollar))}
                      {m.volRatio !== null && m.volRatio >= VOLUME_THRESHOLD && (
                        <span className="ml-1.5 text-[#D97706] font-semibold">{m.volRatio.toFixed(1)}× vol</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* News */}
        <Card title="News on your holdings" subtitle="Headlines that name a company you own">
          {news === null ? <Skeleton rows={4} /> : !news.length ? (
            <Empty>No company-specific headlines for your holdings right now.</Empty>
          ) : (
            <>
              <ul className="space-y-3">
                {news.slice(0, 6).map(({ ticker, item }) => (
                  <li key={item.id} className="flex gap-2.5">
                    <span className="shrink-0 mt-0.5"><TickerLink ticker={ticker} className="text-[10px] font-bold text-[#1F65F0] bg-[#EBF2FF] rounded px-1.5 py-0.5" /></span>
                    <div className="min-w-0">
                      <a href={item.link} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-[#0A0A0A] hover:text-[#1F65F0] leading-snug line-clamp-2">
                        {item.title}
                      </a>
                      <p className="text-[11px] text-[#525252] mt-0.5">
                        {item.publisher} · {timeAgo(item.publishedAt)}
                        {item.alsoReportedBy.length > 0 && <span className="text-[#A3A3A3]"> · +{item.alsoReportedBy.length} sources</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {newsSource && <SourceTag className="mt-3" source={newsSource.source} asOf={newsSource.asOf} cached={newsSource.cached} />}
            </>
          )}
        </Card>

        {/* Upcoming */}
        <Card title="Coming up" subtitle={`Next ${LOOKAHEAD_DAYS} days: your holdings and major US releases`}>
          {upcoming === null ? <Skeleton rows={4} /> : !upcoming.length ? (
            <Empty>Nothing scheduled in the next {LOOKAHEAD_DAYS} days.</Empty>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((e) => {
                const d = daysUntil(e.date);
                return (
                  <li key={e.key} className="flex items-start gap-3">
                    <div className={`shrink-0 rounded-xl px-2 py-1.5 text-center min-w-[52px] border ${d <= 7 ? "bg-[#FFF7ED] border-[#FED7AA]" : "bg-[#F7F7F8] border-[#E5E5E5]"}`}>
                      <p className="text-[11px] font-bold text-[#0A0A0A]">{localDate(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      <p className="text-[10px] text-[#525252]">{d === 0 ? "Today" : d === 1 ? "Tmrw" : `${d}d`}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#0A0A0A] flex items-center gap-1.5">
                        {e.ticker && <TickerLink ticker={e.ticker} />}
                        <span>{e.title}</span>
                        {e.kind === "macro" && <span className="text-[10px] font-semibold text-[#525252] bg-[#F0F0F0] px-1.5 py-0.5 rounded">US economy</span>}
                      </p>
                      <p className="text-[11px] text-[#525252] truncate">{e.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Sectors from the profile */}
      {watchedSectors.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-[#525252] mr-1">Sectors you watch:</span>
          {watchedSectors.map((s) => (
            <span key={s.symbol} className="text-[12px] bg-white border border-[#E5E5E5] rounded-xl px-2.5 py-1">
              <span className="text-[#0A0A0A] font-medium">{s.label}</span>{" "}
              <span className={`font-semibold tabular-nums ${s.changePercent === null ? "text-[#A3A3A3]" : tone(s.changePercent)}`}>
                {s.changePercent === null ? "—" : signed(s.changePercent)}
              </span>
            </span>
          ))}
          <Link href="/settings" className="text-[12px] text-[#1F65F0] hover:underline ml-1">Edit</Link>
        </div>
      )}
    </div>
  );
}
