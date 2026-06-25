"use client";

import { useState } from "react";
import { PortfolioPositionWithData } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";

interface Props {
  positions: PortfolioPositionWithData[];
  onEdit?: (position: PortfolioPositionWithData) => void;
  onDelete?: (id: string) => void;
}

function PencilIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export default function PortfolioTable({ positions, onEdit, onDelete }: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (positions.length === 0) {
    return <div className="text-center py-12 text-gray-400 text-sm">No positions.</div>;
  }

  const hasActions = onEdit || onDelete;

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm bg-white" style={{ minWidth: 860 }}>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {["Ticker", "Name", "Sector", "Shares", "Buy Price", "Buy Date", "Current", "Value", "P&L ($)", "P&L (%)"].map((h) => (
                <th
                  key={h}
                  className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                    ["Ticker", "Name", "Sector", "Buy Date"].includes(h) ? "" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
              {hasActions && <th className="px-3 py-3 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {positions.map((p) => {
              const pl = p.profitLoss ?? 0;
              const plColor = pl >= 0 ? "text-green-600" : "text-red-500";
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3 font-bold text-blue-600">{p.ticker}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{p.sector}</td>
                  <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{p.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{formatCurrency(p.purchasePrice)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(p.purchaseDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    {p.error ? "—" : formatCurrency(p.currentPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    {p.error ? "—" : formatCurrency(p.currentValue)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${plColor}`}>
                    {p.error ? "—" : formatCurrency(pl)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${plColor}`}>
                    {p.error ? "—" : formatPercent(p.percentReturn)}
                  </td>
                  {hasActions && (
                    <td className="px-3 py-3">
                      {pendingDelete === p.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-xs text-gray-500 whitespace-nowrap">Delete?</span>
                          <button
                            onClick={() => { setPendingDelete(null); onDelete?.(p.id); }}
                            className="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600 font-medium"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setPendingDelete(null)}
                            className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 font-medium"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-2 transition-opacity">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(p)}
                              className="text-gray-300 hover:text-blue-500 transition-colors"
                              title="Edit position"
                            >
                              <PencilIcon />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => setPendingDelete(p.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                              title="Delete position"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
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
          const plColor = pl >= 0 ? "text-green-600" : "text-red-500";
          return (
            <div key={p.id} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-600 text-base">{p.ticker}</span>
                    <span className="text-gray-400 text-xs">{p.quantity} shares</span>
                  </div>
                  <p className="text-gray-600 text-xs mt-0.5">{p.name}</p>
                  <p className="text-gray-400 text-xs">{p.sector}</p>
                </div>
                <div className="text-right shrink-0">
                  {p.error ? (
                    <span className="text-red-400 text-xs">Unavailable</span>
                  ) : (
                    <>
                      <p className="font-bold text-gray-900 tabular-nums">{formatCurrency(p.currentPrice)}</p>
                      <p className={`text-sm font-semibold tabular-nums ${plColor}`}>{formatPercent(p.percentReturn)}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-gray-100">
                <div>
                  <p className="text-gray-400">Buy Price</p>
                  <p className="text-gray-700 font-medium tabular-nums">{formatCurrency(p.purchasePrice)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Buy Date</p>
                  <p className="text-gray-700 font-medium">{formatDate(p.purchaseDate)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Current Value</p>
                  <p className="text-gray-700 font-medium tabular-nums">{p.error ? "—" : formatCurrency(p.currentValue)}</p>
                </div>
                <div>
                  <p className="text-gray-400">P&L</p>
                  <p className={`font-semibold tabular-nums ${plColor}`}>
                    {p.error ? "—" : `${formatCurrency(pl)} (${formatPercent(p.percentReturn)})`}
                  </p>
                </div>
              </div>

              {hasActions && (
                pendingDelete === p.id ? (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Delete {p.ticker}?</span>
                    <button
                      onClick={() => { setPendingDelete(null); onDelete?.(p.id); }}
                      className="text-xs px-2.5 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setPendingDelete(null)}
                      className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(p)}
                        className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-1.5 transition-colors"
                      >
                        <PencilIcon />
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => setPendingDelete(p.id)}
                        className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1.5 transition-colors"
                      >
                        <TrashIcon />
                        Delete
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
