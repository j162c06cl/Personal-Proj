"use client";

import { useState } from "react";
import { PortfolioPositionWithData } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";
import TickerLink from "@/components/TickerLink";

interface Props {
  positions: PortfolioPositionWithData[];
  onEdit?: (position: PortfolioPositionWithData) => void;
  onDelete?: (id: string) => void;
  fmt?: (usd: number | null) => string;
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

export default function PortfolioTable({ positions, onEdit, onDelete, fmt = formatCurrency }: Props) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (positions.length === 0) {
    return <div className="text-center py-12 text-[#525252] text-[13px]">No positions.</div>;
  }

  const hasActions = onEdit || onDelete;

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-[#E5E5E5]">
        <table className="w-full text-sm bg-white" style={{ minWidth: 860 }}>
          <thead>
            <tr className="border-b border-[#E5E5E5] bg-[#F7F7F8]">
              {["Ticker", "Name", "Sector", "Shares", "Buy Price", "Buy Date", "Current", "Value", "P&L ($)", "P&L (%)"].map((h) => (
                <th
                  key={h}
                  className={`px-4 py-3 text-[11px] font-semibold text-[#525252] uppercase tracking-wider ${
                    ["Ticker", "Name", "Sector", "Buy Date"].includes(h) ? "" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
              {hasActions && <th className="px-3 py-3 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {positions.map((p) => {
              const pl = p.profitLoss ?? 0;
              const plColor = pl >= 0 ? "text-[#22C55E]" : "text-[#EF4444]";
              return (
                <tr key={p.id} className="hover:bg-[#F7F7F8] transition-colors group">
                  <td className="px-4 py-3"><TickerLink ticker={p.ticker} /></td>
                  <td className="px-4 py-3 text-[#0A0A0A] text-[13px] max-w-[140px] truncate">{p.name}</td>
                  <td className="px-4 py-3 text-[#525252] text-[11px] whitespace-nowrap">{p.sector}</td>
                  <td className="px-4 py-3 text-right text-[#525252] tabular-nums text-[13px]">{p.quantity}</td>
                  <td className="px-4 py-3 text-right text-[#525252] tabular-nums text-[13px]">{fmt(p.purchasePrice)}</td>
                  <td className="px-4 py-3 text-[#525252] whitespace-nowrap text-[13px]">{formatDate(p.purchaseDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#0A0A0A] tabular-nums">
                    {p.error ? "—" : fmt(p.currentPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#0A0A0A] tabular-nums">
                    {p.error ? "—" : fmt(p.currentValue)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${plColor}`}>
                    {p.error ? "—" : fmt(pl)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${plColor}`}>
                    {p.error ? "—" : formatPercent(p.percentReturn)}
                  </td>
                  {hasActions && (
                    <td className="px-3 py-3">
                      {pendingDelete === p.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[11px] text-[#525252] whitespace-nowrap">Delete?</span>
                          <button
                            onClick={() => { setPendingDelete(null); onDelete?.(p.id); }}
                            className="text-[11px] px-2 py-0.5 bg-[#EF4444] text-white rounded-lg hover:bg-[#DC2626] font-semibold transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setPendingDelete(null)}
                            className="text-[11px] px-2 py-0.5 bg-[#F7F7F8] border border-[#E5E5E5] text-[#0A0A0A] rounded-lg hover:bg-[#EBEBEB] font-medium transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-2 transition-opacity">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(p)}
                              className="text-[#A3A3A3] hover:text-[#1F65F0] transition-colors"
                              title="Edit position"
                            >
                              <PencilIcon />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => setPendingDelete(p.id)}
                              className="text-[#A3A3A3] hover:text-[#EF4444] transition-colors"
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
          const plColor = pl >= 0 ? "text-[#22C55E]" : "text-[#EF4444]";
          return (
            <div key={p.id} className="bg-white rounded-2xl p-4 border border-[#E5E5E5]">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <TickerLink ticker={p.ticker} className="font-bold text-[#1F65F0] text-[15px]" />
                    <span className="text-[#A3A3A3] text-[11px]">{p.quantity} shares</span>
                  </div>
                  <p className="text-[#525252] text-[11px] mt-0.5">{p.name}</p>
                  <p className="text-[#A3A3A3] text-[11px]">{p.sector}</p>
                </div>
                <div className="text-right shrink-0">
                  {p.error ? (
                    <span className="text-[#EF4444] text-[11px]">Unavailable</span>
                  ) : (
                    <>
                      <p className="font-bold text-[#0A0A0A] tabular-nums">{fmt(p.currentPrice)}</p>
                      <p className={`text-[13px] font-semibold tabular-nums ${plColor}`}>{formatPercent(p.percentReturn)}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-3 border-t border-[#F0F0F0]">
                <div>
                  <p className="text-[#A3A3A3]">Buy Price</p>
                  <p className="text-[#0A0A0A] font-medium tabular-nums">{fmt(p.purchasePrice)}</p>
                </div>
                <div>
                  <p className="text-[#A3A3A3]">Buy Date</p>
                  <p className="text-[#0A0A0A] font-medium">{formatDate(p.purchaseDate)}</p>
                </div>
                <div>
                  <p className="text-[#A3A3A3]">Current Value</p>
                  <p className="text-[#0A0A0A] font-medium tabular-nums">{p.error ? "—" : fmt(p.currentValue)}</p>
                </div>
                <div>
                  <p className="text-[#A3A3A3]">P&L</p>
                  <p className={`font-semibold tabular-nums ${plColor}`}>
                    {p.error ? "—" : `${fmt(pl)} (${formatPercent(p.percentReturn)})`}
                  </p>
                </div>
              </div>

              {hasActions && (
                pendingDelete === p.id ? (
                  <div className="mt-3 pt-3 border-t border-[#F0F0F0] flex items-center gap-2">
                    <span className="text-[11px] text-[#525252]">Delete {p.ticker}?</span>
                    <button
                      onClick={() => { setPendingDelete(null); onDelete?.(p.id); }}
                      className="text-[11px] px-2.5 py-1 bg-[#EF4444] text-white rounded-xl hover:bg-[#DC2626] font-semibold transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setPendingDelete(null)}
                      className="text-[11px] px-2.5 py-1 bg-[#F7F7F8] border border-[#E5E5E5] text-[#0A0A0A] rounded-xl hover:bg-[#EBEBEB] font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-[#F0F0F0] flex items-center gap-4">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(p)}
                        className="text-[11px] text-[#A3A3A3] hover:text-[#1F65F0] flex items-center gap-1.5 transition-colors"
                      >
                        <PencilIcon />
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => setPendingDelete(p.id)}
                        className="text-[11px] text-[#A3A3A3] hover:text-[#EF4444] flex items-center gap-1.5 transition-colors"
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
