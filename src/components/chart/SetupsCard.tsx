"use client";

import { useState } from "react";
import {
  Detection, SETUP_INFO, SetupCheck, SetupConfig, SetupSummary, SetupType, changedRules,
} from "@/lib/marketData/setups";
import { LEVEL_RULES } from "@/lib/marketData/levels";
import type { Candle } from "@/lib/marketData/types";
import PanelCard, { HowItWorks } from "./PanelCard";
import SetupRulesPanel from "./SetupRulesPanel";
import { formatBarTime } from "./drawing";

/** What a setup row is looking at: the latest bar, or a past detection (by its first bar) */
export type SetupTarget = "latest" | number;

/** Which setup is drawn on the chart */
export interface SetupSelection {
  type: SetupType;
  target: SetupTarget;
}

/** The check and detection a target refers to (falls back to the latest bar if it's gone) */
export function resolveTarget(s: SetupSummary, target: SetupTarget): { check: SetupCheck; detection: Detection | null } {
  if (target !== "latest") {
    const d = s.detections.find((x) => x.start === target);
    if (d) return { check: d.check, detection: d };
  }
  return { check: s.latest, detection: null };
}

/** What a row shows by default: the recent detection if there is one, otherwise the latest bar */
export const defaultTarget = (s: SetupSummary): SetupTarget => (s.recent ? s.recent.start : "latest");

function Checklist({ check }: { check: SetupCheck }) {
  const groups = [
    { title: `Core rules: ${check.coreMet} of ${check.coreTotal} met (all needed)`, items: check.conditions.filter((c) => c.core) },
    { title: `Confirmations: ${check.confirmationsMet} of ${check.confirmationsTotal} met`, items: check.conditions.filter((c) => !c.core) },
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

/** Short score for the collapsed row */
const score = (c: SetupCheck) => `Core ${c.coreMet}/${c.coreTotal} · Conf ${c.confirmationsMet}/${c.confirmationsTotal}`;

export default function SetupsCard({
  summaries,
  candles,
  volRatio,
  times,
  intraday,
  timeframeLabel,
  latestForming,
  price,
  config,
  onConfigChange,
  selected,
  onSelect,
  onFocusBar,
  onPlan,
}: {
  summaries: SetupSummary[];
  candles: Candle[];
  /** Each bar's volume ÷ usual volume, as the rules measure it */
  volRatio: (number | null)[];
  times: readonly number[];
  intraday: boolean;
  timeframeLabel: string;
  /** The newest bar is still trading, so results on it can change */
  latestForming: boolean;
  price: (v: number) => string;
  config: SetupConfig;
  onConfigChange: (c: SetupConfig) => void;
  selected: SetupSelection | null;
  onSelect: (s: SetupSelection | null) => void;
  onFocusBar: (index: number) => void;
  /** Start a trade plan from a detected setup */
  onPlan: (type: SetupType, check: SetupCheck, detection: Detection | null) => void;
}) {
  const [open, setOpen] = useState<SetupType | null>(null);
  const [views, setViews] = useState<Partial<Record<SetupType, SetupTarget>>>({});
  const [inspecting, setInspecting] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const barCount = candles.length;
  const lastBar = barCount - 1;
  const when = (i: number) => formatBarTime(times[i], intraday);
  const span = (d: Detection) => (d.start === d.end ? when(d.start) : `${when(d.start)} – ${when(d.end)}`);
  const ago = (i: number) => {
    const n = lastBar - i;
    return n === 0 ? "latest bar" : `${n} bar${n === 1 ? "" : "s"} ago`;
  };
  const customised = changedRules(config).length;

  function statusText(s: SetupSummary, d: Detection): { text: string; tone: string } {
    if (d.status.kind === "invalidated") {
      const verb = s.type === "goldenCross" ? "Reversed" : "Invalidated";
      return { text: `${verb} ${when(d.status.index)}: ${d.status.text}`, tone: "text-[#F04E23]" };
    }
    if (d.end === lastBar) return { text: "Met on the latest bar", tone: "text-[#00B341]" };
    return { text: s.type === "goldenCross" ? "Still in place (no death cross since)" : "Still valid (invalidation level not hit since)", tone: "text-[#00B341]" };
  }

  function choose(type: SetupType, target: SetupTarget) {
    setViews((v) => ({ ...v, [type]: target }));
    // A setup already on the chart follows what's being looked at
    if (selected?.type === type) onSelect({ type, target });
  }

  return (
    <PanelCard title="Setups" aside={customised ? `${timeframeLabel} bars · custom rules` : `${timeframeLabel} bars`}>
      {customised > 0 && (
        <p className="text-[11px] text-[#7C3AED] bg-[#F3EEFF] rounded-lg px-2.5 py-1.5 mb-2">
          Using your own rules ({customised} changed from the defaults).
        </p>
      )}
      <ul className="divide-y divide-[#F0F0F0] -mt-1">
        {summaries.map((s) => {
          const info = SETUP_INFO[s.type];
          const target = views[s.type] ?? defaultTarget(s);
          const { check, detection } = resolveTarget(s, target);
          const isOpen = open === s.type;
          const onChart = selected?.type === s.type;
          const headline = s.recent ? s.recent.check : s.latest;
          const recentStatus = s.recent ? statusText(s, s.recent) : null;
          const last = s.detections[s.detections.length - 1];
          const provisional = latestForming && check.index === lastBar;
          return (
            <li key={s.type} className="py-2.5">
              <button onClick={() => setOpen(isOpen ? null : s.type)} aria-expanded={isOpen} className="w-full flex items-start gap-2 text-left">
                <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${s.recent ? (s.recent.status.kind === "valid" ? "bg-[#7C3AED]" : "bg-[#A3A3A3]") : "bg-[#E5E5E5]"}`} aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#0A0A0A]">
                      {info.name}
                      {s.recent?.check.stage && (
                        <span className={`ml-1.5 px-1.5 py-px rounded text-[10px] font-semibold align-middle ${s.recent.check.stage === "confirmed" ? "bg-[#F3EEFF] text-[#7C3AED]" : "bg-[#F5F5F5] text-[#525252]"}`}>
                          {s.recent.check.stage === "confirmed" ? "Confirmed" : "Forming"}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] tabular-nums text-[#525252] shrink-0" title="Core rules met · confirmations met">{score(headline)}</span>
                  </span>
                  <span className="block text-[11px] text-[#525252] mt-0.5">
                    {s.recent ? (
                      <>
                        <span className="font-semibold text-[#7C3AED]">Detected {span(s.recent)} · {ago(s.recent.end)}</span>
                        {recentStatus && <span className={`block ${recentStatus.tone}`}>{recentStatus.text}</span>}
                      </>
                    ) : (
                      <>Not detected now{last ? ` · last ${when(last.start)} (${ago(last.end)})` : ` · none in the last ${s.scanned} bars`}</>
                    )}
                  </span>
                </span>
                <span aria-hidden className={`mt-0.5 text-[11px] text-[#A3A3A3] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
              </button>

              {isOpen && (
                <div className="mt-2 ml-4 space-y-2.5">
                  <p className="text-[12px] text-[#525252]">{info.summary}</p>

                  <label className="block text-[11px] font-semibold text-[#0A0A0A]">
                    Looking at
                    <select
                      value={String(target)}
                      onChange={(e) => choose(s.type, e.target.value === "latest" ? "latest" : Number(e.target.value))}
                      className="mt-1 block w-full px-2 py-1.5 text-[12px] font-normal bg-white border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#2D8CFF]"
                    >
                      <option value="latest">The latest bar ({when(lastBar)})</option>
                      {[...s.detections].reverse().map((d) => (
                        <option key={d.start} value={d.start}>
                          Detected {span(d)}{d.check.stage ? ` · ${d.check.stage}` : ""} · {d.status.kind === "valid" ? "still valid" : s.type === "goldenCross" ? "reversed" : "invalidated"}
                        </option>
                      ))}
                    </select>
                    <span className="block mt-1 font-normal text-[#A3A3A3]">
                      {s.detections.length} detection{s.detections.length === 1 ? "" : "s"} in the last {s.scanned} bars.
                    </span>
                  </label>

                  <div className="text-[12px]">
                    <p className="font-semibold text-[#0A0A0A]">
                      {detection
                        ? detection.start === detection.end
                          ? `Rules on ${when(check.index)}, the bar it was detected`
                          : `Rules on ${when(check.index)}, the last bar of this detection (detected on every bar ${span(detection)})`
                        : `Rules on the latest bar, ${when(check.index)}`}
                    </p>
                    <p className="text-[#525252]">
                      {check.detected
                        ? check.stage === "forming" ? "Detected as forming: all core rules met, no close above the flag yet."
                          : "Detected: all core rules met."
                        : `Not detected: ${check.coreTotal - check.coreMet} core rule${check.coreTotal - check.coreMet === 1 ? "" : "s"} not met.`}
                    </p>
                    {provisional && (
                      <p className="mt-1 text-[#B45309]">This bar is still trading, so its close and volume, and these results, can still change.</p>
                    )}
                    {detection && (
                      <p className={`mt-1 ${statusText(s, detection).tone}`}>
                        {detection.status.kind === "valid"
                          ? detection.end === lastBar ? "Detected on the latest bar." : `Since then: still valid. ${check.invalidation.text.replace(/\.$/, "")} hasn't happened.`
                          : `Since then: ${statusText(s, detection).text}.`}
                      </p>
                    )}
                  </div>

                  <Checklist check={check} />
                  <p className="text-[12px] text-[#525252]">
                    <span className="font-semibold text-[#0A0A0A]">Invalidated by:</span> {check.invalidation.text}
                  </p>

                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => onSelect(onChart ? null : { type: s.type, target })}
                      className="text-[12px] font-semibold text-[#2D8CFF] hover:underline"
                    >
                      {onChart ? "Hide from chart" : "Show on chart"}
                    </button>
                    <button onClick={() => setInspecting(!inspecting)} aria-expanded={inspecting} className="text-[12px] font-semibold text-[#2D8CFF] hover:underline">
                      {inspecting ? "Hide candles" : `Inspect candles (${check.evidence.length})`}
                    </button>
                    {check.detected && (
                      <button onClick={() => onPlan(s.type, check, detection)} className="text-[12px] font-semibold text-[#2D8CFF] hover:underline">
                        Plan a trade
                      </button>
                    )}
                  </div>

                  {inspecting && (
                    <div>
                      <p className="text-[11px] text-[#525252] mb-1">
                        Every bar these results depend on. Select one to see it on the chart.
                      </p>
                      <ol className="border border-[#F0F0F0] rounded-lg divide-y divide-[#F0F0F0] max-h-[320px] overflow-y-auto">
                        {check.evidence.map((e) => {
                          const b = candles[e.index];
                          const r = volRatio[e.index];
                          if (!b) return null;
                          return (
                            <li key={e.index}>
                              <button
                                onClick={() => { onSelect({ type: s.type, target }); onFocusBar(e.index); }}
                                className="w-full text-left px-2 py-1.5 hover:bg-[#F7F7F7] focus:bg-[#F7F7F7] focus:outline-none"
                              >
                                <span className="flex items-baseline justify-between gap-2 text-[12px]">
                                  <span className="font-semibold text-[#0A0A0A]">{e.role}</span>
                                  <span className="text-[11px] text-[#525252] shrink-0">{when(e.index)}</span>
                                </span>
                                <span className="block text-[11px] text-[#525252] tabular-nums">
                                  O {price(b.open)} H {price(b.high)} L {price(b.low)} C {price(b.close)}
                                  {r !== null && <> · Vol {r.toFixed(1)}× usual</>}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
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

      <div className="mt-3">
        <button onClick={() => setRulesOpen(!rulesOpen)} aria-expanded={rulesOpen} className="text-[12px] font-semibold text-[#2D8CFF] hover:underline">
          {rulesOpen ? "Hide rules" : "Adjust rules"}
        </button>
        {rulesOpen && <SetupRulesPanel config={config} onChange={onConfigChange} />}
      </div>

      <HowItWorks summary="How setups are judged">
        <p>
          Each setup is a fixed list of rules. <b>Core rules</b> must all pass for the setup to count as detected;{" "}
          <b>confirmations</b> add evidence. Both are shown as counts. There are no weights and no hidden factors.
        </p>
        <p>
          Rules only look at bars up to the one being judged. Support and resistance come from earlier bars, and a swing
          point needs {LEVEL_RULES.pivotBars} later bars to be confirmed. Whether a setup was invalidated afterwards is
          reported separately and never changes the detection.
        </p>
        <p>
          Distances are in average bar ranges (the mean high-to-low range, gaps included, of the previous{" "}
          {config.general.rangeBars} bars), so the rules work on any timeframe. Volume is compared with the previous{" "}
          {config.general.volumeBars} bars on daily charts, and with the same time of day in earlier sessions on intraday
          charts, because volume is always heavy at the open.
        </p>
        <p>
          Consecutive bars that all meet the rules count as one detection. A detection is recent if it ended in the last{" "}
          {config.breakout.recentBars} bars ({config.goldenCross.recentBars} for a golden cross). The last{" "}
          {config.general.scanBars} bars are searched; golden crosses across the whole history.
        </p>
      </HowItWorks>
    </PanelCard>
  );
}
