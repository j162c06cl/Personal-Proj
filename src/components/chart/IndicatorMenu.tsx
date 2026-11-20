"use client";

import { useEffect, useRef, useState } from "react";
import { IndicatorId } from "@/lib/marketData/indicators";
import { INDICATORS, IndicatorGroup } from "./indicatorDefs";

const GROUPS: IndicatorGroup[] = ["Moving averages", "Volume", "Momentum"];

/** "Indicators" button with a panel of on/off switches, each with a one-line explanation */
export default function IndicatorMenu({
  enabled,
  intraday,
  onToggle,
}: {
  enabled: ReadonlySet<IndicatorId>;
  intraday: boolean;
  onToggle: (id: IndicatorId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-bold border transition-colors ${
          open ? "border-[#2D8CFF] text-[#2D8CFF] bg-[#EAF4FF]" : "border-[#E5E5E5] text-[#525252] hover:border-[#2D8CFF] hover:text-[#2D8CFF]"
        }`}
      >
        Indicators
        {enabled.size > 0 && <span className="min-w-[18px] px-1 rounded-full bg-[#2D8CFF] text-white text-[11px] leading-[18px]">{enabled.size}</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(340px,calc(100vw-32px))] max-h-[70vh] overflow-y-auto bg-white border border-[#E5E5E5] rounded-2xl shadow-lg p-2">
          {GROUPS.map((g) => (
            <div key={g} className="py-1">
              <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold text-[#A3A3A3] uppercase tracking-wider">{g}</p>
              {INDICATORS.filter((d) => d.group === g).map((d) => {
                const unavailable = d.intradayOnly && !intraday;
                const on = enabled.has(d.id);
                return (
                  <label key={d.id} className={`flex gap-3 px-2 py-2 rounded-xl ${unavailable ? "opacity-60" : "cursor-pointer hover:bg-[#FAFAFA]"}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(d.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#2D8CFF]"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-[#0A0A0A]">
                        <span className="w-3 h-0.5 rounded-full shrink-0" style={{ background: `var(${d.color[0]}, ${d.color[1]})` }} />
                        {d.label}
                      </span>
                      <span className="block text-[12px] leading-snug text-[#525252] mt-0.5">
                        {unavailable ? "Shown on intraday timeframes only, because VWAP restarts every session. " : ""}
                        {d.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
