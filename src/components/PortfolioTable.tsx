"use client";

import { PortfolioPositionWithData } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";

interface Props {
  positions: PortfolioPositionWithData[];
}

export default function PortfolioTable({ positions }: Props) {
  if (positions.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">Loading data...</div>;
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm bg-white">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {["Ticker", "Name", "Shares", "Buy Price", "Buy Date", "Current Price", "Current Value", "P&L ($)", "P&L (%)"].map((h) => (
                <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${h !== "Ticker" && h !== "Name" && h !== "Buy Date" ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {positions.map((p) => {
              const pl = p.profitLoss ?? 0;
              const plColor = pl >= 0 ? "text-emerald-600" : "text-red-500";
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-emerald-600">{p.ticker}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[150px] truncate">{p.name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{p.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(p.purchasePrice)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(p.purchaseDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{p.error ? "—" : formatCurrency(p.currentPrice)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{p.error ? "—" : formatCurrency(p.currentValue)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${plColor}`}>{p.error ? "—" : formatCurrency(pl)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${plColor}`}>{p.error ? "—" : formatPercent(p.percentReturn)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {positions.map((p) => {
          const pl = p.profitLoss ?? 0;
          const plColor = pl >= 0 ? "text-emerald-600" : "text-red-500";
          return (
            <div key={p.id} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="font-bold text-emerald-600 text-base">{p.ticker}</span>
                  <span className="ml-2 text-gray-500 text-sm">{p.quantity} shares</span>
                  <p className="text-gray-500 text-xs mt-0.5 truncate">{p.name}</p>
                </div>
                {!p.error && (
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatCurrency(p.currentPrice)}</p>
                    <p className={`text-sm font-semibold ${plColor}`}>{formatPercent(p.percentReturn)}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-gray-100">
                <div><p className="text-gray-400">Buy Price</p><p className="text-gray-700 font-medium">{formatCurrency(p.purchasePrice)}</p></div>
                <div><p className="text-gray-400">Current Value</p><p className="text-gray-700 font-medium">{p.error ? "—" : formatCurrency(p.currentValue)}</p></div>
                <div className="col-span-2"><p className="text-gray-400">P&L</p><p className={`font-semibold ${plColor}`}>{p.error ? "—" : `${formatCurrency(pl)} (${formatPercent(p.percentReturn)})`}</p></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
