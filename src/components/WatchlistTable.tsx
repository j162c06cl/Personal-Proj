"use client";

import { useState } from "react";
import { WatchlistEntryWithData } from "@/lib/types";
import { formatCurrency, formatLargeNumber, formatVolume } from "@/lib/formatters";

interface Props {
  entries: WatchlistEntryWithData[];
  onDelete?: (ticker: string) => void;
  editMode?: boolean;
}

function Change({ change, changePercent }: { change: number | null; changePercent: number | null }) {
  if (change === null || changePercent === null) return <span className="text-[#A3A3A3]">—</span>;
  const up = change >= 0;
  const s = up ? "+" : "";
  return (
    <span className={`font-semibold tabular-nums ${up ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
      {s}{formatCurrency(change)}
      <span className="text-[11px] font-medium ml-1 opacity-75">({s}{changePercent.toFixed(2)}%)</span>
    </span>
  );
}

function Nil() {
  return <span className="text-[#A3A3A3]">—</span>;
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function WeekRangeBar({ low, high, current }: { low: number | null; high: number | null; current: number | null }) {
  if (low === null || high === null || current === null || high <= low) {
    return <Nil />;
  }
  const pct = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  const fromHigh = ((high - current) / high) * 100;
  return (
    <div className="min-w-[130px]">
      <div className="flex justify-between text-[11px] text-[#A3A3A3] mb-1 tabular-nums leading-none">
        <span>{formatCurrency(low)}</span>
        <span>{formatCurrency(high)}</span>
      </div>
      <div className="relative h-1.5 bg-[#EBEBEB] rounded-full">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-300 to-[#1F65F0] rounded-full"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white border-2 border-[#525252] rounded-full shadow-sm"
          style={{ left: `calc(${pct}% - 4px)` }}
        />
      </div>
      <p className="text-[11px] text-[#A3A3A3] mt-0.5 text-right leading-none">
        {fromHigh.toFixed(1)}% from high
      </p>
    </div>
  );
}

export default function WatchlistTable({ entries, onDelete, editMode }: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-[#525252]">
        <p className="text-[13px]">No stocks in this watchlist.</p>
        <p className="text-[11px] mt-1">Add a ticker using the input above.</p>
      </div>
    );
  }

  function handleDeleteClick(ticker: string) {
    setPendingDelete(ticker);
  }

  function handleConfirmDelete(ticker: string) {
    setPendingDelete(null);
    onDelete?.(ticker);
  }

  function handleCancelDelete() {
    setPendingDelete(null);
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#E5E5E5]">
        <table className="w-full text-sm bg-white" style={{ minWidth: 1120 }}>
          <thead>
            <tr className="text-left border-b border-[#E5E5E5] bg-[#F7F7F8]">
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] sticky left-0 bg-[#F7F7F8] z-10 uppercase tracking-wider">Ticker</th>
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] text-right uppercase tracking-wider">Price</th>
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] text-right uppercase tracking-wider">Change</th>
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] text-right uppercase tracking-wider">Open / Day Range</th>
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] text-right uppercase tracking-wider">Vol / Avg Vol</th>
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] uppercase tracking-wider">52W Range</th>
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] text-right uppercase tracking-wider">Mkt Cap</th>
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] text-right uppercase tracking-wider">P/E</th>
              <th className="px-4 py-3 text-[11px] font-semibold text-[#525252] text-right uppercase tracking-wider">Div %</th>
              {onDelete && <th className="px-3 py-3 w-28" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-[#F7F7F8] transition-colors group">
                <td className="px-4 py-3 font-bold text-[#1F65F0] sticky left-0 bg-white group-hover:bg-[#F7F7F8] z-10">{e.ticker}</td>
                <td className="px-4 py-3 text-[#0A0A0A] max-w-[180px] truncate text-[13px]">{e.name}</td>

                <td className="px-4 py-3 text-right font-semibold text-[#0A0A0A] tabular-nums">
                  {e.price !== null ? formatCurrency(e.price) : <Nil />}
                </td>

                <td className="px-4 py-3 text-right">
                  {e.error
                    ? <span className="text-[11px] text-[#EF4444]">Unavailable</span>
                    : <Change change={e.change} changePercent={e.changePercent} />}
                </td>

                <td className="px-4 py-3 text-right text-[11px] tabular-nums">
                  {e.open !== null || e.dayLow !== null || e.dayHigh !== null ? (
                    <div className="space-y-0.5">
                      {e.open !== null && (
                        <p className="text-[#525252]">
                          <span className="text-[#A3A3A3] font-medium">O</span> {formatCurrency(e.open)}
                        </p>
                      )}
                      <p className="text-[#0A0A0A]">
                        {e.dayLow !== null ? formatCurrency(e.dayLow) : "—"}
                        <span className="text-[#A3A3A3] mx-1">–</span>
                        {e.dayHigh !== null ? formatCurrency(e.dayHigh) : "—"}
                      </p>
                    </div>
                  ) : <Nil />}
                </td>

                <td className="px-4 py-3 text-right text-[11px] tabular-nums">
                  {e.volume !== null || e.avgVolume !== null ? (
                    <div className="space-y-0.5">
                      {e.volume !== null && <p className="text-[#0A0A0A] font-medium">{formatVolume(e.volume)}</p>}
                      {e.avgVolume !== null && (
                        <p className="text-[#A3A3A3]">
                          avg {formatVolume(e.avgVolume)}
                        </p>
                      )}
                    </div>
                  ) : <Nil />}
                </td>

                <td className="px-4 py-4">
                  <WeekRangeBar low={e.weekLow52} high={e.weekHigh52} current={e.price} />
                </td>

                <td className="px-4 py-3 text-right text-[#525252] text-[13px]">
                  {e.marketCap !== null ? formatLargeNumber(e.marketCap) : <Nil />}
                </td>

                <td className="px-4 py-3 text-right text-[#525252] tabular-nums text-[13px]">
                  {e.pe !== null ? e.pe.toFixed(1) : <Nil />}
                </td>

                <td className="px-4 py-3 text-right text-[#525252] tabular-nums text-[13px]">
                  {e.divYield !== null ? `${(e.divYield * 100).toFixed(2)}%` : <Nil />}
                </td>

                {onDelete && (
                  <td className="px-3 py-3 text-right">
                    {pendingDelete === e.ticker ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-[11px] text-[#525252] whitespace-nowrap">Remove?</span>
                        <button
                          onClick={() => handleConfirmDelete(e.ticker)}
                          className="text-[11px] px-2 py-0.5 bg-[#EF4444] text-white rounded-lg hover:bg-[#DC2626] font-semibold transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={handleCancelDelete}
                          className="text-[11px] px-2 py-0.5 bg-[#F7F7F8] border border-[#E5E5E5] text-[#0A0A0A] rounded-lg hover:bg-[#EBEBEB] font-medium transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDeleteClick(e.ticker)}
                        className="text-[#A3A3A3] hover:text-[#EF4444] transition-colors"
                        title={`Remove ${e.ticker}`}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {entries.map((e) => (
          <div key={e.id} className="bg-white rounded-2xl p-4 border border-[#E5E5E5]">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[#1F65F0] text-[15px]">{e.ticker}</span>
                  {e.pe !== null && (
                    <span className="text-[11px] bg-[#EBF2FF] text-[#1F65F0] px-1.5 py-0.5 rounded-lg font-semibold">
                      P/E {e.pe.toFixed(1)}
                    </span>
                  )}
                  {e.divYield !== null && (
                    <span className="text-[11px] bg-[#EBF2FF] text-[#1F65F0] px-1.5 py-0.5 rounded-lg font-semibold">
                      {(e.divYield * 100).toFixed(2)}% div
                    </span>
                  )}
                </div>
                <p className="text-[#525252] text-[11px] mt-0.5 truncate">{e.name}</p>
              </div>
              <div className="text-right shrink-0">
                {e.error ? (
                  <span className="text-[#EF4444] text-[11px]">Unavailable</span>
                ) : (
                  <>
                    <p className="font-bold text-[#0A0A0A] tabular-nums text-[15px]">
                      {e.price !== null ? formatCurrency(e.price) : "—"}
                    </p>
                    <Change change={e.change} changePercent={e.changePercent} />
                  </>
                )}
              </div>
            </div>

            {!e.error && (
              <>
                <div className="mt-3 pt-3 border-t border-[#F0F0F0] grid grid-cols-2 gap-x-4 gap-y-2.5 text-[11px]">
                  {e.open !== null && (
                    <div>
                      <p className="text-[#A3A3A3] mb-0.5">Open</p>
                      <p className="text-[#0A0A0A] font-medium tabular-nums">{formatCurrency(e.open)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[#A3A3A3] mb-0.5">Day Range</p>
                    <p className="text-[#0A0A0A] font-medium tabular-nums">
                      {e.dayLow !== null ? formatCurrency(e.dayLow) : "—"} – {e.dayHigh !== null ? formatCurrency(e.dayHigh) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#A3A3A3] mb-0.5">Volume</p>
                    <p className="text-[#0A0A0A] font-medium">{e.volume !== null ? formatVolume(e.volume) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[#A3A3A3] mb-0.5">Avg Volume</p>
                    <p className="text-[#0A0A0A] font-medium">{e.avgVolume !== null ? formatVolume(e.avgVolume) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[#A3A3A3] mb-0.5">Mkt Cap</p>
                    <p className="text-[#0A0A0A] font-medium">{e.marketCap !== null ? formatLargeNumber(e.marketCap) : "—"}</p>
                  </div>
                </div>

                {(e.weekLow52 !== null || e.weekHigh52 !== null) && (
                  <div className="mt-3 pt-3 border-t border-[#F0F0F0]">
                    <p className="text-[11px] text-[#A3A3A3] mb-1.5">52-Week Range</p>
                    <WeekRangeBar low={e.weekLow52} high={e.weekHigh52} current={e.price} />
                  </div>
                )}
              </>
            )}

            {onDelete && (
              pendingDelete === e.ticker ? (
                <div className="mt-3 pt-3 border-t border-[#F0F0F0] flex items-center gap-2">
                  <span className="text-[11px] text-[#525252]">Remove {e.ticker}?</span>
                  <button
                    onClick={() => handleConfirmDelete(e.ticker)}
                    className="text-[11px] px-2.5 py-1 bg-[#EF4444] text-white rounded-xl hover:bg-[#DC2626] font-semibold transition-colors"
                  >
                    Remove
                  </button>
                  <button
                    onClick={handleCancelDelete}
                    className="text-[11px] px-2.5 py-1 bg-[#F7F7F8] border border-[#E5E5E5] text-[#0A0A0A] rounded-xl hover:bg-[#EBEBEB] font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-[#F0F0F0]">
                  <button
                    onClick={() => handleDeleteClick(e.ticker)}
                    className="text-[11px] text-[#EF4444] border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-medium transition-colors"
                  >
                    <TrashIcon />
                    Remove
                  </button>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </>
  );
}
