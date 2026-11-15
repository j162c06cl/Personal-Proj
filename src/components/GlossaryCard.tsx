"use client";

import { useState } from "react";

interface GlossaryCardProps {
  term: string;
  definition: string;
  example?: string;
}

export default function GlossaryCard({ term, definition, example }: GlossaryCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border-b border-[#E5E5E5] last:border-b-0 transition-colors ${open ? "bg-[#F7F7F8]" : "bg-white hover:bg-[#F7F7F8]"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
      >
        <span className="text-[14px] font-semibold text-[#0A0A0A]">{term}</span>
        <svg
          className={`w-4 h-4 text-[#A3A3A3] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5">
          <p className="text-[13px] text-[#525252] leading-relaxed">{definition}</p>
          {example && (
            <p className="mt-3 text-[12px] text-[#525252] bg-[#EAF4FF] rounded-xl p-3 border-l-2 border-[#2D8CFF]">
              <span className="font-semibold text-[#0A0A0A]">Example: </span>{example}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
