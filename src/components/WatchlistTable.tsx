"use client";

import { useState } from "react";
import { WatchlistEntryWithData } from "@/lib/types";
import { formatCurrency, formatLargeNumber, formatVolume } from "@/lib/formatters";

interface Props {
  entries: WatchlistEntryWithData[];
  onDelete?: (ticker: string) => void;
}

function Change({ change, changePercent }: { change: number | null; changePercent: number | null }) {
  if (change === null || changePercent === null) return <span className="text-gray-400">—</span>;
  const up = change >= 0;
  const s = up ? "+" : "";
  return (
    <span className={`font-semibold tabular-nums ${up ? "text-emerald-600" : "text-red-500"}`}>
      {s}{formatCurrency(change)}
      <span className="text-xs font-medium ml-1 opacity-75">({s}{changePercent.toFixed(2)}%)</span>
    </span>
  );
}

function Nil() {
  return <span className="text-gray-300">—</span>;
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
      <div className="flex justify-between text-xs text-gray-400 mb-1 tabular-nums leading-none">
        <span>{formatCurrency(low)}</span>
        <span>{formatCurrency(high)}</span>
      </div>
      <div className="relative h-1.5 bg-gray-100 rounded-full">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-300 to-emerald-400 rounded-full"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white border-2 border-gray-500 rounded-full shadow-sm"
          style={{ left: `calc(${pct}% - 4px)` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-0.5 text-right leading-none">
        {fromHigh.toFixed(1)}% from high
      </p>
    </div>
  );
}

export default function WatchlistTable({ entries, onDelete }: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">No stocks in this watchlist.</p>
        <p className="text-xs mt-1">Add a ticker using the input above.</p>
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
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm bg-white" style={{ minWidth: 1120 }}>
          <thead>
            <tr className="text-left border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50 z-10">Ticker</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Price</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Change</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Open / Day Range</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Vol / Avg Vol</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">52W Range</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Mkt Cap</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">P/E</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Div %</th>
              {onDelete && <th className="px-3 py-3 w-28" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-4 py-3 font-bold text-emerald-600 sticky left-0 bg-white group-hover:bg-gray-50 z-10">{e.ticker}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{e.name}</td>

                {/* Price */}
                <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                  {e.price !== null ? formatCurrency(e.price) : <Nil />}
                </td>

                {/* Change */}
                <td className="px-4 py-3 text-right">
                  {e.error
                    ? <span className="text-xs text-red-400">Unavailable</span>
                    : <Change change={e.change} changePercent={e.changePercent} />}
                </td>

                {/* Open / Day Range (stacked) */}
                <td className="px-4 py-3 text-right text-xs tabular-nums">
                  {e.open !== null || e.dayLow !== null || e.dayHigh !== null ? (
                    <div className="space-y-0.5">
                      {e.open !== null && (
                        <p className="text-gray-500">
                          <span className="text-gray-400 font-medium">O</span> {formatCurrency(e.open)}
                        </p>
                      )}
                      <p className="text-gray-600">
                        {e.dayLow !== null ? formatCurrency(e.dayLow) : "—"}
                        <span className="text-gray-300 mx-1">–</span>
                        {e.dayHigh !== null ? formatCurrency(e.dayHigh) : "—"}
                      </p>
                    </div>
                  ) : <Nil />}
                </td>

                {/* Volume / Avg Volume (stacked) */}
                <td className="px-4 py-3 text-right text-xs tabular-nums">
                  {e.volume !== null || e.avgVolume !== null ? (
                    <div className="space-y-0.5">
                      {e.volume !== null && <p className="text-gray-700 font-medium">{formatVolume(e.volume)}</p>}
                      {e.avgVolume !== null && (
                        <p className="text-gray-400">
                          avg {formatVolume(e.avgVolume)}
                        </p>
                      )}
                    </div>
                  ) : <Nil />}
                </td>

                {/* 52W Range bar */}
                <td className="px-4 py-4">
                  <WeekRangeBar low={e.weekLow52} high={e.weekHigh52} current={e.price} />
                </td>

                {/* Mkt Cap */}
                <td className="px-4 py-3 text-right text-gray-600">
                  {e.marketCap !== null ? formatLargeNumber(e.marketCap) : <Nil />}
                </td>

                {/* P/E */}
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                  {e.pe !== null ? e.pe.toFixed(1) : <Nil />}
                </td>

                {/* Div Yield */}
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                  {e.divYield !== null ? `${(e.divYield * 100).toFixed(2)}%` : <Nil />}
                </td>

                {/* Delete / Confirm */}
                {onDelete && (
                  <td className="px-3 py-3 text-right">
                    {pendingDelete === e.ticker ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-xs text-gray-500 whitespace-nowrap">Remove?</span>
                        <button
                          onClick={() => handleConfirmDelete(e.ticker)}
                          className="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600 font-medium"
                        >
                          Yes
                        </button>
                        <button
                          onClick={handleCancelDelete}
                          className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 font-medium"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDeleteClick(e.ticker)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
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
          <div key={e.id} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            {/* Header: ticker + price/change */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-emerald-600 text-base">{e.ticker}</span>
                  {e.pe !== null && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-medium">
                      P/E {e.pe.toFixed(1)}
                    </span>
                  )}
                  {e.divYield !== null && (
                    <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md font-medium">
                      {(e.divYield * 100).toFixed(2)}% div
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-xs mt-0.5 truncate">{e.name}</p>
              </div>
              <div className="text-right shrink-0">
                {e.error ? (
                  <span className="text-red-400 text-xs">Unavailable</span>
                ) : (
                  <>
                    <p className="font-bold text-gray-900 tabular-nums text-base">
                      {e.price !== null ? formatCurrency(e.price) : "—"}
                    </p>
                    <Change change={e.change} changePercent={e.changePercent} />
                  </>
                )}
              </div>
            </div>

            {!e.error && (
              <>
                {/* Stats grid */}
                <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                  {e.open !== null && (
                    <div>
                      <p className="text-gray-400 mb-0.5">Open</p>
                      <p className="text-gray-700 font-medium tabular-nums">{formatCurrency(e.open)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-400 mb-0.5">Day Range</p>
                    <p className="text-gray-700 font-medium tabular-nums">
                      {e.dayLow !== null ? formatCurrency(e.dayLow) : "—"} – {e.dayHigh !== null ? formatCurrency(e.dayHigh) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Volume</p>
                    <p className="text-gray-700 font-medium">{e.volume !== null ? formatVolume(e.volume) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Avg Volume</p>
                    <p className="text-gray-700 font-medium">{e.avgVolume !== null ? formatVolume(e.avgVolume) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Mkt Cap</p>
                    <p className="text-gray-700 font-medium">{e.marketCap !== null ? formatLargeNumber(e.marketCap) : "—"}</p>
                  </div>
                </div>

                {/* 52W Range bar */}
                {(e.weekLow52 !== null || e.weekHigh52 !== null) && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-1.5">52-Week Range</p>
                    <WeekRangeBar low={e.weekLow52} high={e.weekHigh52} current={e.price} />
                  </div>
                )}
              </>
            )}

            {/* Delete / Confirm */}
            {onDelete && (
              pendingDelete === e.ticker ? (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Remove {e.ticker}?</span>
                  <button
                    onClick={() => handleConfirmDelete(e.ticker)}
                    className="text-xs px-2.5 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
                  >
                    Remove
                  </button>
                  <button
                    onClick={handleCancelDelete}
                    className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleDeleteClick(e.ticker)}
                  className="mt-3 text-xs text-gray-400 hover:text-red-500 flex items-center gap-1.5 transition-colors"
                >
                  <TrashIcon />
                  Remove
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </>
  );
}
