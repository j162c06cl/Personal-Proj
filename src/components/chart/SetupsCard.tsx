"use client";

import { useState } from "react";
import { SETUP_INFO, SETUP_RULES, SetupCheck, SetupSummary, SetupType } from "@/lib/marketData/setups";
import { LEVEL_RULES } from "@/lib/marketData/levels";
import PanelCard, { HowItWorks } from "./PanelCard";
import { formatBarTime } from "./drawing";

/** Which check of which setup is drawn on the chart */
export interface SetupSelection {
  type: SetupType;
  which: "last" | "latest";
}

/** The check a row shows: the recent detection if there is one, otherwise the latest bar */
export function shownCheck(s: SetupSummary): { check: SetupCheck; which: "last" | "latest" } {
  return s.recent && s.last ? { check: s.last, which: "last" } : { check: s.latest, which: "latest" };
}

function Checklist({ check }: { check: SetupCheck }) {
  const groups = [
    { title: "Core rules (all needed)", items: check.conditions.filter((c) => c.core) },
    { title: "Confirmations", items: check.conditions.filter((c) => !c.core) },
  ];
  return (
    <div className="space-y-2">
      {groups.map((g) => g.items.length > 0 && (
        <div key={g.title}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A3A3A3]">{g.title}</p>
          <ul className="mt-1 space-y-1">
            {g.items.map((c) => (
              <li key={c.label} className="flex gap-2 text-[12px] leading-snug">
                <span aria-hidden className={`shrink-0 font-bold ${c.met ? "text-[#00B341]" : "text-[#F04E23]"}`}>{c.met ? "✓" : "✗"}</span>
                <span>
                  <span className="sr-only">{c.met ? "Met: " : "Not met: "}</span>
                  <span className="font-medium text-[#0A0A0A]">{c.label}.</span>{" "}
                  <span className="text-[#525252] tabular-nums">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The five rule-based setups, each with its checklist, score and invalidation level */
export default function SetupsCard({
  summaries,
  times,
  intraday,
  timeframeLabel,
  barCount,
  selected,
  onSelect,
}: {
  summaries: SetupSummary[];
  times: readonly number[];
  intraday: boolean;
  timeframeLabel: string;
  barCount: number;
  selected: SetupSelection | null;
  onSelect: (s: SetupSelection | null) => void;
}) {
  const [open, setOpen] = useState<SetupType | null>(null);
  const when = (i: number) => formatBarTime(times[i], intraday);
  const ago = (i: number) => {
    const n = barCount - 1 - i;
    return n === 0 ? "latest bar" : `${n} bar${n === 1 ? "" : "s"} ago`;
  };

  return (
    <PanelCard title="Setups" aside={`${timeframeLabel} bars`}>
      <ul className="divide-y divide-[#F0F0F0] -mt-1">
        {summaries.map((s) => {
          const info = SETUP_INFO[s.type];
          const { check, which } = shownCheck(s);
          const isOpen = open === s.type;
          const onChart = selected?.type === s.type;
          const start = s.lastStart ?? s.last?.index ?? null;
          return (
            <li key={s.type} className="py-2.5">
              <button
                onClick={() => setOpen(isOpen ? null : s.type)}
                aria-expanded={isOpen}
                className="w-full flex items-start gap-2 text-left"
              >
                <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${s.recent ? "bg-[#7C3AED]" : "bg-[#D4D4D4]"}`} aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#0A0A0A]">{info.name}</span>
                    <span className="text-[12px] tabular-nums text-[#525252]" title="Rules met out of rules checked">
                      {check.met}/{check.total} criteria
                    </span>
                  </span>
                  <span className="block text-[11px] text-[#525252] mt-0.5">
                    {s.recent && start !== null ? (
                      <span className="font-semibold text-[#7C3AED]">Detected {when(start)} · {ago(start)}</span>
                    ) : (
                      <>
                        Not detected now
                        {start !== null ? ` · last ${when(start)} (${ago(start)})` : ` · none in the last ${s.scanned} bars`}
                      </>
                    )}
                  </span>
                </span>
                <span aria-hidden className={`mt-0.5 text-[11px] text-[#A3A3A3] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
              </button>

              {isOpen && (
                <div className="mt-2 ml-4 space-y-2.5">
                  <p className="text-[12px] text-[#525252]">{info.summary}</p>
                  <p className="text-[11px] font-semibold text-[#0A0A0A]">
                    {which === "last" ? `When detected (${when(check.index)})` : `On the latest bar (${when(check.index)})`}:{" "}
                    {check.met} of {check.total} rules met{which === "latest" && !check.detected ? ", not all core rules" : ""}
                  </p>
                  <Checklist check={check} />
                  <p className="text-[12px] text-[#525252]">
                    <span className="font-semibold text-[#0A0A0A]">Invalidated by:</span> {check.invalidation.text}
                  </p>
                  {s.occurrences > 0 && (
                    <p className="text-[11px] text-[#A3A3A3]">
                      Detected {s.occurrences} {s.occurrences === 1 ? "time" : "times"} in the last {s.scanned} bars.
                    </p>
                  )}
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => onSelect(onChart && selected?.which === which ? null : { type: s.type, which })}
                      className="text-[12px] font-semibold text-[#2D8CFF] hover:underline"
                    >
                      {onChart && selected?.which === which ? "Hide from chart" : "Show on chart"}
                    </button>
                    {which === "latest" && s.last && (
                      <button
                        onClick={() => onSelect(onChart && selected?.which === "last" ? null : { type: s.type, which: "last" })}
                        className="text-[12px] font-semibold text-[#2D8CFF] hover:underline"
                      >
                        {onChart && selected?.which === "last" ? "Hide last detection" : "Show last detection"}
                      </button>
                    )}
                  </div>
                  {onChart && selected?.which === "last" && which === "latest" && s.last && (
                    <div className="border-t border-[#F0F0F0] pt-2">
                      <p className="text-[11px] font-semibold text-[#0A0A0A] mb-1">Last detection ({when(s.last.index)}): {s.last.met} of {s.last.total} rules met</p>
                      <Checklist check={s.last} />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[11px] text-[#525252] bg-[#F5F5F5] rounded-lg px-3 py-2 leading-relaxed">
        These describe price patterns with fixed rules. They aren&apos;t buy signals, and how often each setup worked out
        hasn&apos;t been tested yet.
      </p>

      <HowItWorks summary="How setups are scored">
        <p>
          Each setup is a fixed list of rules. <b>Core rules</b> must all pass for the setup to count as detected;{" "}
          <b>confirmations</b> add evidence. The score is how many rules passed. There are no weights and no hidden factors.
        </p>
        <p>
          Rules only look at bars up to the one being judged. Support and resistance come from earlier bars, and a swing
          point needs {LEVEL_RULES.pivotBars} later bars to be confirmed.
        </p>
        <p>
          Distances are in average bar ranges (the mean high-to-low range, gaps included, of the previous{" "}
          {SETUP_RULES.rangeBars} bars), so the rules work on any timeframe. &ldquo;Heavier volume&rdquo; means at least{" "}
          {SETUP_RULES.volumeSurge}× the average of the previous {SETUP_RULES.volumeBars} bars.
        </p>
        <p>
          A setup counts as recent if it was detected in the last {SETUP_RULES.recentBars.breakout} bars (
          {SETUP_RULES.recentBars.goldenCross} for a golden cross). The last {SETUP_RULES.scanBars} bars are searched for
          earlier ones; golden crosses are searched across the whole history.
        </p>
      </HowItWorks>
    </PanelCard>
  );
}
