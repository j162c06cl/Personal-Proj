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
    return <div className="text-center py-12 text-[#6e6e73] text-[13px]">No positions.</div>;
  }

  const hasActions = onEdit || onDelete;

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm bg-white" style={{ minWidth: 860 }}>
          <thead>
            <tr className="border-b border-black/[0.06] bg-[#f9f9f9]">
              {["Ticker", "Name", "Sector", "Shares", "Buy Price", "Buy Date", "Current", "Value", "P&L ($)", "P&L (%)"].map((h) => (
                <th
                  key={h}
                  className={`px-4 py-3 text-[11px] font-semibold text-[#6e6e73] ${
                    ["Ticker", "Name", "Sector", "Buy Date"].includes(h) ? "" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
              {hasActions && <th className="px-3 py-3 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {positions.map((p) => {
              const pl = p.profitLoss ?? 0;
              const plColor = pl >= 0 ? "text-[#34c759]" : "text-[#ff3b30]";
              return (
                <tr key={p.id} className="hover:bg-[#f5f5f7] transition-colors group">
                  <td className="px-4 py-3 font-bold text-[#0071e3]">{p.ticker}</td>
                  <td className="px-4 py-3 text-[#1d1d1f] text-[13px] max-w-[140px] truncate">{p.name}</td>
                  <td className="px-4 py-3 text-[#6e6e73] text-[11px] whitespace-nowrap">{p.sector}</td>
                  <td className="px-4 py-3 text-right text-[#6e6e73] tabular-nums text-[13px]">{p.quantity}</td>
                  <td className="px-4 py-3 text-right text-[#6e6e73] tabular-nums text-[13px]">{formatCurrency(p.purchasePrice)}</td>
                  <td className="px-4 py-3 text-[#6e6e73] whitespace-nowrap text-[13px]">{formatDate(p.purchaseDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#1d1d1f] tabular-nums">
                    {p.error ? "—" : formatCurrency(p.currentPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#1d1d1f] tabular-nums">
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
                          <span className="text-[11px] text-[#6e6e73] whitespace-nowrap">Delete?</span>
                          <button
                            onClick={() => { setPendingDelete(null); onDelete?.(p.id); }}
                            className="text-[11px] px-2 py-0.5 bg-[#ff3b30] text-white rounded-[6px] hover:bg-[#d63028] font-semibold"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setPendingDelete(null)}
                            className="text-[11px] px-2 py-0.5 bg-black/[0.06] text-[#1d1d1f] rounded-[6px] hover:bg-black/[0.1] font-medium"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-2 transition-opacity">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(p)}
                              className="text-[#aeaeb2] hover:text-[#0071e3] transition-colors"
                              title="Edit position"
                            >
                              <PencilIcon />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => setPendingDelete(p.id)}
                              className="text-[#aeaeb2] hover:text-[#ff3b30] transition-colors"
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
          const plColor = pl >= 0 ? "text-[#34c759]" : "text-[#ff3b30]";
          return (
            <div key={p.id} className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#0071e3] text-[15px]">{p.ticker}</span>
                    <span className="text-[#aeaeb2] text-[11px]">{p.quantity} shares</span>
                  </div>
                  <p className="text-[#6e6e73] text-[11px] mt-0.5">{p.name}</p>
                  <p className="text-[#aeaeb2] text-[11px]">{p.sector}</p>
                </div>
                <div className="text-right shrink-0">
                  {p.error ? (
                    <span className="text-[#ff3b30] text-[11px]">Unavailable</span>
                  ) : (
                    <>
                      <p className="font-bold text-[#1d1d1f] tabular-nums">{formatCurrency(p.currentPrice)}</p>
                      <p className={`text-[13px] font-semibold tabular-nums ${plColor}`}>{formatPercent(p.percentReturn)}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-3 border-t border-black/[0.04]">
                <div>
                  <p className="text-[#aeaeb2]">Buy Price</p>
                  <p className="text-[#1d1d1f] font-medium tabular-nums">{formatCurrency(p.purchasePrice)}</p>
                </div>
                <div>
                  <p className="text-[#aeaeb2]">Buy Date</p>
                  <p className="text-[#1d1d1f] font-medium">{formatDate(p.purchaseDate)}</p>
                </div>
                <div>
                  <p className="text-[#aeaeb2]">Current Value</p>
                  <p className="text-[#1d1d1f] font-medium tabular-nums">{p.error ? "—" : formatCurrency(p.currentValue)}</p>
                </div>
                <div>
                  <p className="text-[#aeaeb2]">P&L</p>
                  <p className={`font-semibold tabular-nums ${plColor}`}>
                    {p.error ? "—" : `${formatCurrency(pl)} (${formatPercent(p.percentReturn)})`}
                  </p>
                </div>
              </div>

              {hasActions && (
                pendingDelete === p.id ? (
                  <div className="mt-3 pt-3 border-t border-black/[0.04] flex items-center gap-2">
                    <span className="text-[11px] text-[#6e6e73]">Delete {p.ticker}?</span>
                    <button
                      onClick={() => { setPendingDelete(null); onDelete?.(p.id); }}
                      className="text-[11px] px-2.5 py-1 bg-[#ff3b30] text-white rounded-[8px] hover:bg-[#d63028] font-semibold"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setPendingDelete(null)}
                      className="text-[11px] px-2.5 py-1 bg-black/[0.06] text-[#1d1d1f] rounded-[8px] hover:bg-black/[0.1] font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-black/[0.04] flex items-center gap-4">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(p)}
                        className="text-[11px] text-[#aeaeb2] hover:text-[#0071e3] flex items-center gap-1.5 transition-colors"
                      >
                        <PencilIcon />
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => setPendingDelete(p.id)}
                        className="text-[11px] text-[#aeaeb2] hover:text-[#ff3b30] flex items-center gap-1.5 transition-colors"
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
