"use client";

import { useState } from "react";
import type { Check, ResearchPoint, ResearchSummary, SourceRef, Verdict } from "@/lib/analysis";

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SourceLine({ source }: { source: SourceRef }) {
  const date = fmtDate(source.date);
  const text = `${source.label}${date ? ` · ${date}` : ""}`;
  return source.url ? (
    <a href={source.url} target="_blank" rel="noreferrer" className="text-[10px] text-[#2D8CFF] hover:underline">{text} ↗</a>
  ) : (
    <span className="text-[10px] text-[#A3A3A3]">{text}</span>
  );
}

const ICON: Record<Check["status"], { mark: string; cls: string; label: string }> = {
  pass: { mark: "✓", cls: "bg-[#DCFCE7] text-[#007A2B]", label: "Passes" },
  fail: { mark: "✕", cls: "bg-[#FFF0EB] text-[#B8360F]", label: "Fails" },
  unknown: { mark: "?", cls: "bg-[#F0F0F0] text-[#737373]", label: "Can't judge" },
};

const tally = (v: Verdict) => `${v.checks.filter((c) => c.status === "pass").length} of ${v.checks.length} checks pass`;

/** The pass/fail checks behind a verdict, each with its figure and source */
export function Checklist({ v }: { v: Verdict }) {
  return (
    <div className="rounded-xl bg-[#FAFAFA] border border-[#F0F0F0] p-4">
      <p className="text-[12px] text-[#525252]">
        {v.strategy === "long-term" ? "Judged on the business: growth, profits, cash, debt, valuation and the long trend." : "Judged on the chart: trend, momentum, volume, entry, risk and earnings timing."}
        {" "}<span className="font-semibold text-[#0A0A0A]">{tally(v)}.</span>
      </p>
      <ul className="mt-3 space-y-3">
        {v.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2.5">
            <span className={`shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${ICON[c.status].cls}`} title={ICON[c.status].label} aria-label={ICON[c.status].label}>
              {ICON[c.status].mark}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#0A0A0A]">{c.label}</p>
              <p className="text-[12px] text-[#525252]">{c.detail}</p>
              <SourceLine source={c.source} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const GROUPS: { key: keyof ResearchSummary; title: string; empty: string; dot: string }[] = [
  { key: "strengths", title: "Strengths", empty: "None stand out in the available data.", dot: "bg-[#00B341]" },
  { key: "weaknesses", title: "Weaknesses", empty: "None stand out in the available data.", dot: "bg-[#F04E23]" },
  { key: "catalysts", title: "Catalysts", empty: "No scheduled events or notable positive headlines.", dot: "bg-[#2D8CFF]" },
  { key: "risks", title: "Risks", empty: "No specific risks flagged in the available data.", dot: "bg-[#D97706]" },
];

export function ResearchSummaryView({ summary, limit: initialLimit, groups }: { summary: ResearchSummary; limit?: number; groups?: (keyof ResearchSummary)[] }) {
  const [showAll, setShowAll] = useState(false);
  const limit = showAll ? undefined : initialLimit;
  const shownGroups = groups ? GROUPS.filter((g) => groups.includes(g.key)) : GROUPS;
  const hidden = initialLimit ? shownGroups.reduce((n, g) => n + Math.max(0, summary[g.key].length - initialLimit), 0) : 0;
  return (
    <>
      <div className={`grid grid-cols-1 gap-x-6 gap-y-5 ${shownGroups.length > 1 ? "md:grid-cols-2" : ""}`}>
        {shownGroups.map((g) => {
          const items: ResearchPoint[] = summary[g.key];
          const shown = limit ? items.slice(0, limit) : items;
          return (
            <div key={g.key}>
              <p className="flex items-center gap-2 text-[12px] font-bold text-[#0A0A0A] mb-2">
                <span className={`w-2 h-2 rounded-full ${g.dot}`} aria-hidden />{g.title}
                <span className="font-medium text-[#A3A3A3]">{items.length}</span>
              </p>
              {shown.length ? (
                <ul className="space-y-2.5">
                  {shown.map((p, i) => (
                    <li key={i} className="text-[13px] text-[#262626] leading-snug">
                      {p.text}
                      <span className="block"><SourceLine source={p.source} /></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-[#A3A3A3]">{g.empty}</p>}
            </div>
          );
        })}
      </div>
      {hidden > 0 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-4 text-[12px] font-semibold text-[#2D8CFF] hover:underline">
          {showAll ? "Show fewer" : `Show all (${hidden} more)`}
        </button>
      )}
    </>
  );
}
