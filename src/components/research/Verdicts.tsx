"use client";

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

function VerdictCard({ v, primary }: { v: Verdict; primary: boolean }) {
  return (
    <section className={`bg-white rounded-2xl border p-5 ${primary ? "border-[#1F65F0] shadow-[0_0_0_3px_rgba(31,101,240,0.08)]" : "border-[#E5E5E5]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-[#0A0A0A]">{v.strategy === "long-term" ? "As a long-term investment" : "As a swing trade"}</h2>
          <p className="text-[12px] text-[#525252] mt-0.5">
            {v.strategy === "long-term" ? "Judged on the business: growth, profits, cash, debt, valuation and the long trend." : "Judged on the chart: trend, momentum, volume, entry, risk and earnings timing."}
          </p>
        </div>
        {primary && <span className="shrink-0 text-[10px] font-semibold text-[#1F65F0] bg-[#EBF2FF] px-2 py-0.5 rounded">Your strategy</span>}
      </div>
      <p className="text-[13px] text-[#0A0A0A] font-medium mt-3">{v.summary}</p>
      {/* One segment per check, so the count is visible without becoming a single score */}
      <div className="flex gap-1 mt-3" aria-hidden>
        {v.checks.map((c) => (
          <span key={c.id} className={`h-1.5 flex-1 rounded-full ${c.status === "pass" ? "bg-[#16A34A]" : c.status === "fail" ? "bg-[#DC2626]" : "bg-[#E5E5E5]"}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-3">
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
    </section>
  );
}

/** Long-term and swing verdicts side by side; the investor's own strategy comes first. */
export function Verdicts({ long, swing, primary }: { long: Verdict; swing: Verdict; primary: "long-term" | "swing" }) {
  const cards = primary === "swing" ? [swing, long] : [long, swing];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {cards.map((v) => <VerdictCard key={v.strategy} v={v} primary={v.strategy === primary} />)}
    </div>
  );
}

const GROUPS: { key: keyof ResearchSummary; title: string; empty: string; dot: string }[] = [
  { key: "strengths", title: "Strengths", empty: "None stand out in the available data.", dot: "bg-[#16A34A]" },
  { key: "weaknesses", title: "Weaknesses", empty: "None stand out in the available data.", dot: "bg-[#DC2626]" },
  { key: "catalysts", title: "Catalysts", empty: "No scheduled events or notable positive headlines.", dot: "bg-[#1F65F0]" },
  { key: "risks", title: "Risks", empty: "No specific risks flagged in the available data.", dot: "bg-[#D97706]" },
];

export function ResearchSummaryView({ summary, limit }: { summary: ResearchSummary; limit?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
      {GROUPS.map((g) => {
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
                {limit && items.length > limit && <li className="text-[12px] text-[#A3A3A3]">+{items.length - limit} more in the 30-minute view</li>}
              </ul>
            ) : <p className="text-[13px] text-[#A3A3A3]">{g.empty}</p>}
          </div>
        );
      })}
    </div>
  );
}
