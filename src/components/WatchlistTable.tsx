"use client";

import { WatchlistEntryWithData } from "@/lib/types";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  entries: WatchlistEntryWithData[];
}

function ChangeCell({ change, changePercent }: { change: number | null; changePercent: number | null }) {
  if (change === null || changePercent === null) return <span className="text-gray-500">—</span>;
  const color = change >= 0 ? "text-emerald-400" : "text-red-400";
  const sign = change >= 0 ? "+" : "";
  return (
    <span className={color}>
      {sign}{formatCurrency(change)} ({sign}{changePercent.toFixed(2)}%)
    </span>
  );
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
              <th className="pb-2 font-medium text-right">Day Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="py-3 pr-4 font-bold text-emerald-400">{e.ticker}</td>
                <td className="py-3 pr-4 text-gray-300 max-w-[200px] truncate">{e.name}</td>
                <td className="py-3 pr-4 text-right text-white">
                  {e.error ? <span className="text-gray-500">—</span> : formatCurrency(e.price)}
                </td>
                <td className="py-3 text-right">
                  {e.error
                    ? <span className="text-red-400 text-xs">Unavailable</span>
                    : <ChangeCell change={e.change} changePercent={e.changePercent} />
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {entries.map((e) => (
          <div key={e.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="font-bold text-emerald-400 text-base">{e.ticker}</span>
                <p className="text-gray-400 text-sm mt-0.5 truncate max-w-[180px]">{e.name}</p>
              </div>
              {e.error ? (
                <span className="text-red-400 text-xs">Unavailable</span>
              ) : (
                <div className="text-right">
                  <p className="text-white font-medium">{formatCurrency(e.price)}</p>
                  <ChangeCell change={e.change} changePercent={e.changePercent} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
