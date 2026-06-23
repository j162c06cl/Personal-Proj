"use client";

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

export default function WatchlistTable({ entries, onDelete }: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">No stocks in this watchlist.</p>
        <p className="text-xs mt-1">Add a ticker using the input above.</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm bg-white" style={{ minWidth: 1040 }}>
          <thead>
            <tr className="text-left border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50 z-10">Ticker</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Price</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Change</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Day Range</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Volume</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">52W High</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">52W Low</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Mkt Cap</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">P/E</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Div %</th>
              {onDelete && <th className="px-3 py-3 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-4 py-3 font-bold text-emerald-600 sticky left-0 bg-white group-hover:bg-gray-50 z-10">{e.ticker}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{e.name}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                  {e.price !== null ? formatCurrency(e.price) : <Nil />}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.error
                    ? <span className="text-xs text-red-400">Unavailable</span>
                    : <Change change={e.change} changePercent={e.changePercent} />}
                </td>
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-xs">
                  {e.dayLow !== null || e.dayHigh !== null
                    ? <>{e.dayLow !== null ? formatCurrency(e.dayLow) : "—"} <span className="text-gray-300">–</span> {e.dayHigh !== null ? formatCurrency(e.dayHigh) : "—"}</>
                    : <Nil />}
                </td>
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                  {e.volume !== null ? formatVolume(e.volume) : <Nil />}
                </td>
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                  {e.weekHigh52 !== null ? formatCurrency(e.weekHigh52) : <Nil />}
                </td>
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                  {e.weekLow52 !== null ? formatCurrency(e.weekLow52) : <Nil />}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {e.marketCap !== null ? formatLargeNumber(e.marketCap) : <Nil />}
                </td>
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                  {e.pe !== null ? e.pe.toFixed(1) : <Nil />}
                </td>
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                  {e.divYield !== null ? `${(e.divYield * 100).toFixed(2)}%` : <Nil />}
                </td>
                {onDelete && (
                  <td className="px-3 py-3">
                    <button
                      onClick={() => onDelete(e.ticker)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                      title={`Remove ${e.ticker}`}
                    >
                      <TrashIcon />
                    </button>
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
                    <p className="font-bold text-gray-900 tabular-nums">
                      {e.price !== null ? formatCurrency(e.price) : "—"}
                    </p>
                    <Change change={e.change} changePercent={e.changePercent} />
                  </>
                )}
              </div>
            </div>

            {!e.error && (
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
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
                  <p className="text-gray-400 mb-0.5">52W Range</p>
                  <p className="text-gray-700 font-medium tabular-nums">
                    {e.weekLow52 !== null ? formatCurrency(e.weekLow52) : "—"} – {e.weekHigh52 !== null ? formatCurrency(e.weekHigh52) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 mb-0.5">Mkt Cap</p>
                  <p className="text-gray-700 font-medium">{e.marketCap !== null ? formatLargeNumber(e.marketCap) : "—"}</p>
                </div>
              </div>
            )}

            {onDelete && (
              <button
                onClick={() => onDelete(e.ticker)}
                className="mt-3 text-xs text-gray-400 hover:text-red-500 flex items-center gap-1.5 transition-colors"
              >
                <TrashIcon />
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
