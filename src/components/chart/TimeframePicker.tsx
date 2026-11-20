"use client";

import { TIMEFRAMES, Timeframe } from "@/lib/marketData/types";

/** Timeframe pills, styled like the range pills on the research page */
export default function TimeframePicker({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Chart timeframe">
      {TIMEFRAMES.map((t) => (
        <button
          key={t.value}
          aria-pressed={value === t.value}
          onClick={() => onChange(t.value)}
          className={`px-3 py-1 rounded-full text-[13px] font-bold transition-colors ${
            value === t.value ? "bg-[#2D8CFF] text-white" : "text-[#2D8CFF] hover:bg-[#EAF4FF]"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
