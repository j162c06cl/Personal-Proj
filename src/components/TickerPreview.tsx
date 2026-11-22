"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getFundamentals, getQuote } from "@/lib/data";
import { Fundamentals, QuoteData, Sourced } from "@/lib/types";
import { formatPercent } from "@/lib/formatters";
import { defaultCurrency, formatBig, formatMoney } from "@/lib/markets";
import { categoryFrom, knownCategory } from "@/lib/categories";
import SourceTag from "@/components/SourceTag";

/**
 * A quick look at a ticker before deciding to watch it: price, today's move, sector,
 * 52-week range and a few key numbers, with a link to the full research page.
 */
export default function TickerPreview({
  ticker,
  watching,
  onAdd,
  onClose,
  listName,
}: {
  ticker: string;
  watching: boolean;
  onAdd: (meta: { category: string | null; price: number | null; exchange: string | null; currency: string | null }) => void;
  /** Name of the list the stock will be added to */
  listName?: string;
  /** Shows a close button when given */
  onClose?: () => void;
}) {
  const [quote, setQuote] = useState<Sourced<QuoteData> | null | undefined>(undefined);
  const [fund, setFund] = useState<Sourced<Fundamentals> | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setQuote(undefined);
    setFund(undefined);
    getQuote(ticker).then((q) => live && setQuote(q));
    getFundamentals(ticker).then((f) => live && setFund(f));
    return () => { live = false; };
  }, [ticker]);

  const q = quote?.value;
  const f = fund?.value;
  const notFound = quote !== undefined && (!q || q.price === null) && fund !== undefined && !f;
  const category = f ? categoryFrom({ quoteType: f.quoteType, sector: f.profile.sector }) : knownCategory(ticker);
  const up = (q?.changePercent ?? 0) >= 0;
  const ccy = f?.currency ?? q?.currency ?? defaultCurrency(ticker);
  const exchange = f?.exchange || q?.exchange || null;
  const formatCurrency = (n: number | null) => formatMoney(n, ccy);
  const formatLargeNumber = (n: number | null) => formatBig(n, ccy);

  // Position of today's price inside the 52-week range, 0–100
  const lo = q?.weekLow52 ?? null, hi = q?.weekHigh52 ?? null;
  const rangePos = q?.price != null && lo !== null && hi !== null && hi > lo ? ((q.price - lo) / (hi - lo)) * 100 : null;

  const divYield = f?.dividend.yield ?? q?.divYield ?? null;
  const stats: { label: string; value: string }[] = [
    { label: "Market cap", value: q?.marketCap ? formatLargeNumber(q.marketCap) : "—" },
    { label: "P/E", value: q?.pe ? q.pe.toFixed(1) : "—" },
    // Most feeds give a fraction (0.012); some fallbacks give a percent (1.2)
    { label: "Dividend", value: divYield ? `${(divYield * (divYield < 1 ? 100 : 1)).toFixed(2)}%` : "—" },
    { label: "Analyst target", value: f?.analysts.targetMean ? formatCurrency(f.analysts.targetMean) : "—" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-[#2D8CFF]/30 shadow-[0_4px_24px_rgba(45,140,255,0.08)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[20px] font-semibold tracking-tight text-[#0A0A0A]">{ticker}</span>
            {category && <span className="text-[11px] font-semibold text-[#2D8CFF] bg-[#EAF4FF] rounded-lg px-2 py-0.5">{category}</span>}
            {f?.profile.industry && <span className="text-[12px] text-[#525252]">{f.profile.industry}</span>}
            {exchange && <span className="text-[11px] font-semibold text-[#525252] border border-[#E5E5E5] rounded-lg px-1.5 py-0.5">{exchange} · {ccy}</span>}
          </div>
          <p className="text-[13px] text-[#525252] truncate">{q?.name || f?.name || (quote === undefined ? "Loading…" : "")}</p>
        </div>
        {onClose && <button onClick={onClose} className="text-[#A3A3A3] hover:text-[#0A0A0A] text-[20px] leading-none shrink-0" aria-label="Close preview">×</button>}
      </div>

      {notFound ? (
        <p className="text-[13px] text-[#525252] mt-4">No data found for {ticker}. Check the symbol and try again.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-3 mt-3">
            {quote === undefined ? (
              <div className="h-8 w-28 bg-black/[0.05] rounded animate-pulse" />
            ) : (
              <>
                <span className="text-[28px] font-bold tabular-nums tracking-tight text-[#0A0A0A]">{q?.price != null ? formatCurrency(q.price) : "—"}</span>
                {q?.changePercent != null && (
                  <span className={`text-[14px] font-semibold tabular-nums ${up ? "text-[#00B341]" : "text-[#F04E23]"}`}>{formatPercent(q.changePercent)} today</span>
                )}
              </>
            )}
          </div>

          {rangePos !== null && (
            <div className="mt-3 max-w-md">
              <div className="flex justify-between text-[11px] text-[#525252] mb-1">
                <span>52-week low {formatCurrency(lo)}</span>
                <span>high {formatCurrency(hi)}</span>
              </div>
              <div className="relative h-1.5 bg-[#F0F0F0] rounded-full">
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#2D8CFF] ring-2 ring-white" style={{ left: `${Math.min(100, Math.max(0, rangePos))}%` }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-4">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">{s.label}</p>
                <p className="text-[14px] font-semibold tabular-nums text-[#0A0A0A]">{s.value}</p>
              </div>
            ))}
          </div>

          {f?.profile.summary && <p className="text-[12px] text-[#525252] mt-4 line-clamp-4 leading-relaxed">{f.profile.summary}</p>}
        </>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
        {quote ? <SourceTag source={quote.source} asOf={quote.asOf} cached={quote.cached} /> : <span />}
        <div className="flex items-center gap-2">
          <Link href={`/stock/${encodeURIComponent(ticker)}`} className="px-3.5 py-2 text-[13px] font-semibold text-[#525252] border border-[#E5E5E5] rounded-xl hover:border-[#2D8CFF] hover:text-[#0A0A0A]">
            Full research →
          </Link>
          {watching ? (
            <span className="px-3.5 py-2 text-[13px] font-semibold text-[#2D8CFF] bg-[#EAF4FF] rounded-xl">✓ On {listName ?? "your watchlist"}</span>
          ) : (
            <button onClick={() => onAdd({ category, price: q?.price ?? null, exchange, currency: ccy })} disabled={notFound} className="px-3.5 py-2 text-[13px] font-semibold text-white bg-[#2D8CFF] rounded-full hover:bg-[#1A73E0] disabled:opacity-40">
              + Add to {listName ?? "watchlist"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
