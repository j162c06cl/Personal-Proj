"use client";

import { PortfolioPositionWithData } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";

interface Props {
  positions: PortfolioPositionWithData[];
}

export default function PortfolioTable({ positions }: Props) {
  if (positions.length === 0) {
    return <div className="text-center py-12 text-gray-500 text-sm">Loading data...</div>;
  }

  const totalInvested = positions.reduce((s, p) => s + p.purchasePrice * p.quantity, 0);
  const totalCurrent = positions.reduce((s, p) => s + (p.currentValue ?? p.purchasePrice * p.quantity), 0);
  const totalPL = totalCurrent - totalInvested;
  const totalReturn = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const isUp = totalPL >= 0;

  return (
    <div>
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 mt-4">
        {[
          { label: "Total Invested", value: formatCurrency(totalInvested), color: "text-white" },
          { label: "Current Value", value: formatCurrency(totalCurrent), color: "text-white" },
          { label: "Total P&L", value: formatCurrency(totalPL), color: isUp ? "text-emerald-400" : "text-red-400" },
          { label: "Total Return", value: formatPercent(totalReturn), color: isUp ? "text-emerald-400" : "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-800 rounded-xl p-3 border border-gray-700">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="pb-2 pr-3 font-medium">Ticker</th>
              <th className="pb-2 pr-3 font-medium">Name</th>
              <th className="pb-2 pr-3 font-medium text-right">Shares</th>
              <th className="pb-2 pr-3 font-medium text-right">Buy Price</th>
              <th className="pb-2 pr-3 font-medium">Buy Date</th>
              <th className="pb-2 pr-3 font-medium text-right">Current Price</th>
              <th className="pb-2 pr-3 font-medium text-right">Current Value</th>
              <th className="pb-2 pr-3 font-medium text-right">P&L ($)</th>
              <th className="pb-2 font-medium text-right">P&L (%)</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const pl = p.profitLoss ?? 0;
              const plColor = pl >= 0 ? "text-emerald-400" : "text-red-400";
              return (
                <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-3 pr-3 font-bold text-emerald-400">{p.ticker}</td>
                  <td className="py-3 pr-3 text-gray-300 max-w-[140px] truncate">{p.name}</td>
                  <td className="py-3 pr-3 text-right text-gray-300">{p.quantity}</td>
                  <td className="py-3 pr-3 text-right text-gray-300">{formatCurrency(p.purchasePrice)}</td>
                  <td className="py-3 pr-3 text-gray-300">{formatDate(p.purchaseDate)}</td>
                  <td className="py-3 pr-3 text-right text-white">{p.error ? "—" : formatCurrency(p.currentPrice)}</td>
                  <td className="py-3 pr-3 text-right text-white">{p.error ? "—" : formatCurrency(p.currentValue)}</td>
                  <td className={`py-3 pr-3 text-right font-medium ${plColor}`}>{p.error ? "—" : formatCurrency(pl)}</td>
                  <td className={`py-3 text-right font-medium ${plColor}`}>{p.error ? "—" : formatPercent(p.percentReturn)}</td>
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
          const plColor = pl >= 0 ? "text-emerald-400" : "text-red-400";
          return (
            <div key={p.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="mb-2">
                <span className="font-bold text-emerald-400 text-base">{p.ticker}</span>
                <span className="ml-2 text-gray-400 text-sm">{p.quantity} shares</span>
                <p className="text-gray-400 text-sm mt-0.5 truncate">{p.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-500">Buy Price</span><p className="text-white font-medium">{formatCurrency(p.purchasePrice)}</p></div>
                <div><span className="text-gray-500">Current Price</span><p className="text-white font-medium">{p.error ? "—" : formatCurrency(p.currentPrice)}</p></div>
                <div><span className="text-gray-500">Current Value</span><p className="text-white font-medium">{p.error ? "—" : formatCurrency(p.currentValue)}</p></div>
                <div><span className="text-gray-500">P&L</span><p className={`font-medium ${plColor}`}>{p.error ? "—" : `${formatCurrency(pl)} (${formatPercent(p.percentReturn)})`}</p></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
