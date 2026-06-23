"use client";

import { WatchlistEntryWithData } from "@/lib/types";
import { formatCurrency, formatLargeNumber } from "@/lib/formatters";

interface Props {
  entries: WatchlistEntryWithData[];
}

function Change({ change, changePercent }: { change: number | null; changePercent: number | null }) {
  if (change === null || changePercent === null) return <span className="text-gray-400">—</span>;
  const up = change >= 0;
  const s = up ? "+" : "";
  return (
    <span className={`font-semibold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {s}{formatCurrency(change)}
      <span className="text-xs font-medium ml-1">({s}{changePercent.toFixed(2)}%)</span>
    </span>
  );
}

export default function WatchlistTable({ entries }: Props) {
  if (entries.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">Loading market data...</div>;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm bg-white">
          <thead>
            <tr className="text-left border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticker</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Price</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Day Change</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">52W High</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">52W Low</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Market Cap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-bold text-emerald-600">{e.ticker}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{e.name}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">
                  {e.error ? "—" : formatCurrency(e.price)}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.error
                    ? <span className="text-xs text-red-400">Unavailable</span>
                    : <Change change={e.change} changePercent={e.changePercent} />}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {e.weekHigh52 !== null ? formatCurrency(e.weekHigh52) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {e.weekLow52 !== null ? formatCurrency(e.weekLow52) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {e.marketCap !== null ? formatLargeNumber(e.marketCap) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {entries.map((e) => (
          <div key={e.id} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-start justify-between mb-1">
              <div>
                <span className="font-bold text-emerald-600 text-base">{e.ticker}</span>
                <p className="text-gray-500 text-xs mt-0.5 truncate max-w-[200px]">{e.name}</p>
              </div>
              {e.error ? (
                <span className="text-red-400 text-xs mt-1">Unavailable</span>
              ) : (
                <div className="text-right">
                  <p className="font-bold text-gray-900">{formatCurrency(e.price)}</p>
                  <Change change={e.change} changePercent={e.changePercent} />
                </div>
              )}
            </div>
            {!e.error && (e.weekHigh52 !== null || e.weekLow52 !== null || e.marketCap !== null) && (
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2 text-xs">
                <div><p className="text-gray-400">52W High</p><p className="text-gray-700 font-medium">{e.weekHigh52 !== null ? formatCurrency(e.weekHigh52) : "—"}</p></div>
                <div><p className="text-gray-400">52W Low</p><p className="text-gray-700 font-medium">{e.weekLow52 !== null ? formatCurrency(e.weekLow52) : "—"}</p></div>
                <div><p className="text-gray-400">Market Cap</p><p className="text-gray-700 font-medium">{e.marketCap !== null ? formatLargeNumber(e.marketCap) : "—"}</p></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
