"use client";

import { WatchlistEntryWithData } from "@/lib/types";
import { formatCurrency, formatLargeNumber, formatNumber } from "@/lib/formatters";

interface Props {
  entries: WatchlistEntryWithData[];
}

export default function WatchlistTable({ entries }: Props) {
  if (entries.length === 0) {
    return <div className="text-center py-12 text-gray-500 text-sm">Loading data...</div>;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="pb-2 pr-4 font-medium">Ticker</th>
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium text-right">Price</th>
              <th className="pb-2 pr-4 font-medium text-right">Market Cap</th>
              <th className="pb-2 pr-4 font-medium text-right">P/E</th>
              <th className="pb-2 pr-4 font-medium text-right">Revenue</th>
              <th className="pb-2 font-medium text-right">Net Income</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="py-3 pr-4 font-bold text-emerald-400">{e.ticker}</td>
                <td className="py-3 pr-4 text-gray-300 max-w-[200px] truncate">{e.name}</td>
                <td className="py-3 pr-4 text-right text-white">{e.error ? "—" : formatCurrency(e.price)}</td>
                <td className="py-3 pr-4 text-right text-gray-300">{e.error ? "—" : formatLargeNumber(e.marketCap)}</td>
                <td className="py-3 pr-4 text-right text-gray-300">{e.error ? "—" : (e.peRatio ? formatNumber(e.peRatio) : "N/A")}</td>
                <td className="py-3 pr-4 text-right text-gray-300">{e.error ? "—" : formatLargeNumber(e.revenue)}</td>
                <td className="py-3 text-right text-gray-300">{e.error ? "—" : formatLargeNumber(e.netIncome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {entries.map((e) => (
          <div key={e.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="mb-2">
              <span className="font-bold text-emerald-400 text-base">{e.ticker}</span>
              <p className="text-gray-400 text-sm mt-0.5 truncate">{e.name}</p>
            </div>
            {e.error ? (
              <p className="text-red-400 text-xs">Data unavailable</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-500">Price</span><p className="text-white font-medium">{formatCurrency(e.price)}</p></div>
                <div><span className="text-gray-500">Market Cap</span><p className="text-white font-medium">{formatLargeNumber(e.marketCap)}</p></div>
                <div><span className="text-gray-500">P/E Ratio</span><p className="text-white font-medium">{e.peRatio ? formatNumber(e.peRatio) : "N/A"}</p></div>
                <div><span className="text-gray-500">Revenue</span><p className="text-white font-medium">{formatLargeNumber(e.revenue)}</p></div>
                <div className="col-span-2"><span className="text-gray-500">Net Income</span><p className="text-white font-medium">{formatLargeNumber(e.netIncome)}</p></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
