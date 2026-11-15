"use client";

import { useEffect, useState } from "react";
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
    <a href={source.url} target="_blank" rel="noreferrer" className="text-[10px] text-[#1F65F0] hover:underline">{text} ↗</a>
  ) : (
    <span className="text-[10px] text-[#A3A3A3]">{text}</span>
  );
}

const ICON: Record<Check["status"], { mark: string; cls: string; label: string }> = {
  pass: { mark: "✓", cls: "bg-[#DCFCE7] text-[#166534]", label: "Passes" },
  fail: { mark: "✕", cls: "bg-[#FEE2E2] text-[#991B1B]", label: "Fails" },
  unknown: { mark: "?", cls: "bg-[#F0F0F0] text-[#737373]", label: "Can't judge" },
};

function CheckBar({ v }: { v: Verdict }) {
  // One segment per check, so the count is visible without becoming a single score
  return (
    <div className="flex gap-1" aria-hidden>
      {v.checks.map((c) => (
        <span key={c.id} className={`h-1.5 flex-1 rounded-full ${c.status === "pass" ? "bg-[#16A34A]" : c.status === "fail" ? "bg-[#DC2626]" : "bg-[#E5E5E5]"}`} />
      ))}
    </div>
  );
}

const title = (v: Verdict) => (v.strategy === "long-term" ? "As a long-term investment" : "As a swing trade");
const tally = (v: Verdict) => `${v.checks.filter((c) => c.status === "pass").length} of ${v.checks.length} checks pass`;

function VerdictCard({ v, primary, compact, onCollapse }: { v: Verdict; primary: boolean; compact: boolean; onCollapse?: () => void }) {
  const [showChecks, setShowChecks] = useState(!compact);
  useEffect(() => setShowChecks(!compact), [compact]);

  return (
    <section className={`bg-white rounded-2xl border p-5 ${primary ? "border-[#1F65F0] shadow-[0_0_0_3px_rgba(31,101,240,0.08)]" : "border-[#E5E5E5]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-[#0A0A0A]">{title(v)}</h2>
          <p className="text-[12px] text-[#525252] mt-0.5">
            {v.strategy === "long-term" ? "Judged on the business: growth, profits, cash, debt, valuation and the long trend." : "Judged on the chart: trend, momentum, volume, entry, risk and earnings timing."}
          </p>
        </div>
        {primary && <span className="shrink-0 text-[10px] font-semibold text-[#1F65F0] bg-[#EBF2FF] px-2 py-0.5 rounded">Your strategy</span>}
        {onCollapse && <button onClick={onCollapse} className="shrink-0 text-[12px] font-semibold text-[#525252] hover:text-[#0A0A0A]">Hide</button>}
      </div>
      <p className="text-[13px] text-[#0A0A0A] font-medium mt-3">{v.summary}</p>
      <div className="mt-3"><CheckBar v={v} /></div>
      <button onClick={() => setShowChecks((o) => !o)} className="mt-2 text-[12px] font-semibold text-[#1F65F0] hover:underline">
        {showChecks ? "Hide the checks" : `See the ${v.checks.length} checks · ${tally(v)}`}
      </button>
      {showChecks && (
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
      )}
    </section>
  );
}

/**
 * The investor's own strategy gets the full card; the other strategy folds to one line
 * until asked for. `compact` (the 5-minute view) also folds the checks behind a button.
 */
export function Verdicts({ long, swing, primary, compact = false }: { long: Verdict; swing: Verdict; primary: "long-term" | "swing"; compact?: boolean }) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [mine, other] = primary === "swing" ? [swing, long] : [long, swing];
  return (
    <div className="space-y-3">
      <VerdictCard v={mine} primary compact={compact} />
      {otherOpen ? (
        <VerdictCard v={other} primary={false} compact={false} onCollapse={() => setOtherOpen(false)} />
      ) : (
        <button onClick={() => setOtherOpen(true)} className="w-full bg-white rounded-2xl border border-[#E5E5E5] hover:border-[#A3A3A3] px-5 py-3 text-left flex items-center gap-4">
          <span className="text-[13px] font-semibold text-[#0A0A0A] shrink-0">{title(other)}</span>
          <span className="flex-1 min-w-0 hidden sm:block"><CheckBar v={other} /></span>
          <span className="text-[12px] text-[#525252] shrink-0 ml-auto sm:ml-0">{tally(other)} ▸</span>
        </button>
      )}
    </div>
  );
}

const GROUPS: { key: keyof ResearchSummary; title: string; empty: string; dot: string }[] = [
  { key: "strengths", title: "Strengths", empty: "None stand out in the available data.", dot: "bg-[#16A34A]" },
  { key: "weaknesses", title: "Weaknesses", empty: "None stand out in the available data.", dot: "bg-[#DC2626]" },
  { key: "catalysts", title: "Catalysts", empty: "No scheduled events or notable positive headlines.", dot: "bg-[#1F65F0]" },
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
        <button onClick={() => setShowAll((v) => !v)} className="mt-4 text-[12px] font-semibold text-[#1F65F0] hover:underline">
          {showAll ? "Show fewer" : `Show all (${hidden} more)`}
        </button>
      )}
    </>
  );
}
