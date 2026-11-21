"use client";

import { useState } from "react";
import { Direction, NOTE_MAX, PlanNumbers, TradePlan, planMetrics, sharesForRisk } from "@/lib/tradePlan";
import { SETUP_INFO } from "@/lib/marketData/setups";
import PanelCard from "./PanelCard";

/** A plan being written or edited; prices are kept as typed */
export interface PlanDraft {
  /** The saved plan being edited, or null for a new one */
  id: string | null;
  direction: Direction;
  entry: string;
  stop: string;
  target: string;
  shares: string;
  note: string;
  /** Bar the plan's zones start from (Unix seconds) */
  startTime: number;
  source: TradePlan["source"];
  /** Where the starting numbers came from, when they were filled in for the reader */
  why: string[];
}

const num = (s: string): number | null => {
  if (s.trim() === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

export function draftNumbers(d: PlanDraft): PlanNumbers {
  return { direction: d.direction, entry: num(d.entry), stop: num(d.stop), target: num(d.target), shares: num(d.shares) };
}

const inputClass = "w-full px-2 py-1.5 text-[13px] tabular-nums bg-white border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#2D8CFF]";
const linkButton = "text-[12px] font-semibold text-[#2D8CFF] hover:underline";
const ratio = (rr: number) => `1 : ${rr.toFixed(rr >= 10 ? 0 : 1)}`;

function Metrics({ numbers, latest, money, price }: { numbers: PlanNumbers; latest: number; money: (v: number) => string; price: (v: number) => string }) {
  const m = planMetrics(numbers);
  if (m.problems.length) {
    return (
      <ul className="text-[12px] text-[#B45309] bg-[#FFF7ED] rounded-lg px-3 py-2 space-y-0.5" role="status">
        {m.problems.map((p) => <li key={p}>{p}</li>)}
      </ul>
    );
  }
  const long = numbers.direction === "long";
  const entry = numbers.entry!;
  const fromLatest = ((entry - latest) / latest) * 100;
  const rows: [string, string][] = [
    ["Risk per share", `${price(m.riskPerShare!)} (${m.stopPct!.toFixed(2)}% to the stop)`],
    ["Reward per share", `${price(m.rewardPerShare!)} (${m.targetPct!.toFixed(2)}% to the target)`],
    ["Risk : reward", ratio(m.rewardRisk!)],
  ];
  if (m.loss !== null) {
    rows.push(["Potential loss", `−${money(m.loss)} if the stop is hit`]);
    rows.push(["Potential profit", `+${money(m.profit!)} if the target is hit`]);
    rows.push(["Position value", money(m.positionValue!)]);
  }
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] tabular-nums">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[#525252]">{k}</dt>
            <dd className={`text-right font-semibold ${k === "Potential loss" ? "text-[#F04E23]" : k === "Potential profit" ? "text-[#00B341]" : "text-[#0A0A0A]"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-[#525252]">
        Entry is {Math.abs(fromLatest) < 0.005 ? "at" : `${Math.abs(fromLatest).toFixed(2)}% ${fromLatest > 0 ? "above" : "below"}`} the latest price ({price(latest)}).
        {" "}{long ? "A long" : "A short"} trade with a {ratio(m.rewardRisk!)} risk-to-reward breaks even if it reaches its target in{" "}
        {m.breakEvenWinRate!.toFixed(0)}% of trades like it, before costs. That&apos;s arithmetic, not a forecast of how often it will.
      </p>
    </div>
  );
}

export default function TradePlanCard({
  ticker,
  plans,
  draft,
  onDraftChange,
  onSave,
  onNew,
  onEdit,
  onDelete,
  shownId,
  onShow,
  latest,
  price,
  money,
}: {
  ticker: string;
  plans: TradePlan[];
  draft: PlanDraft | null;
  onDraftChange: (d: PlanDraft | null) => void;
  onSave: () => void;
  onNew: () => void;
  onEdit: (p: TradePlan) => void;
  onDelete: (id: string) => void;
  /** Saved plan shown on the chart */
  shownId: string | null;
  onShow: (id: string | null) => void;
  /** Latest price, for the distance to the entry */
  latest: number;
  price: (v: number) => string;
  money: (v: number) => string;
}) {
  const [budget, setBudget] = useState("");
  const set = (patch: Partial<PlanDraft>) => draft && onDraftChange({ ...draft, ...patch });
  const numbers = draft ? draftNumbers(draft) : null;
  const metrics = numbers ? planMetrics(numbers) : null;
  const sorted = [...plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <PanelCard title="Trade plans" aside={ticker}>
      {draft ? (
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (metrics && !metrics.problems.length) onSave(); }}
          aria-label={draft.id ? "Edit trade plan" : "New trade plan"}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-[#0A0A0A]">{draft.id ? "Edit plan" : "New plan"}</p>
            <div className="flex rounded-full border border-[#E5E5E5] p-0.5" role="group" aria-label="Direction">
              {(["long", "short"] as const).map((d) => (
                <button
                  key={d} type="button" aria-pressed={draft.direction === d} onClick={() => set({ direction: d })}
                  className={`px-3 py-0.5 rounded-full text-[12px] font-semibold ${draft.direction === d ? "bg-[#0A0A0A] text-white" : "text-[#525252]"}`}
                >
                  {d === "long" ? "Long" : "Short"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([["entry", "Entry", "#2D8CFF"], ["stop", "Stop-loss", "#F04E23"], ["target", "Target", "#00B341"]] as const).map(([k, label, color]) => (
              <label key={k} className="text-[11px] font-semibold" style={{ color }}>
                {label}
                <input inputMode="decimal" value={draft[k]} onChange={(e) => set({ [k]: e.target.value })} className={`${inputClass} mt-0.5`} aria-label={label} />
              </label>
            ))}
          </div>

          {draft.why.length > 0 && (
            <ul className="text-[11px] text-[#525252] bg-[#F5F5F5] rounded-lg px-3 py-2 space-y-0.5">
              {draft.source && <li className="font-semibold text-[#0A0A0A]">From the {SETUP_INFO[draft.source.setup].name.toLowerCase()} detected {draft.source.detected}</li>}
              {draft.why.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-2 items-end">
            <label className="text-[11px] font-semibold text-[#0A0A0A]">
              Shares (optional)
              <input inputMode="decimal" value={draft.shares} onChange={(e) => set({ shares: e.target.value })} className={`${inputClass} mt-0.5`} aria-label="Shares" />
            </label>
            <div className="text-[11px] font-semibold text-[#0A0A0A]">
              <label htmlFor="risk-budget">Or size for a risk of</label>
              <div className="flex gap-1 mt-0.5">
                <input id="risk-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} placeholder="Amount" />
                <button
                  type="button"
                  disabled={!metrics?.riskPerShare || !(Number(budget) > 0)}
                  onClick={() => metrics?.riskPerShare && set({ shares: String(sharesForRisk(Number(budget), metrics.riskPerShare)) })}
                  className="px-2 text-[12px] font-semibold text-[#2D8CFF] border border-[#E5E5E5] rounded-lg disabled:text-[#A3A3A3]"
                >
                  Size
                </button>
              </div>
            </div>
          </div>

          {numbers && <Metrics numbers={numbers} latest={latest} money={money} price={price} />}

          <label className="block text-[11px] font-semibold text-[#0A0A0A]">
            Note (optional)
            <textarea rows={2} maxLength={NOTE_MAX} value={draft.note} onChange={(e) => set({ note: e.target.value })} className={`${inputClass} mt-0.5 font-normal`} placeholder="Why this trade? What would make you skip it?" />
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={!metrics || metrics.problems.length > 0} className="px-4 py-1.5 text-[12px] font-semibold bg-[#2D8CFF] text-white rounded-full disabled:opacity-40">
              {draft.id ? "Save changes" : "Save plan"}
            </button>
            <button type="button" onClick={() => onDraftChange(null)} className={linkButton}>Cancel</button>
          </div>
          <p className="text-[11px] text-[#A3A3A3]">
            A plan for thinking a trade through. It places no order, and the numbers leave out commissions, slippage and gaps past the stop.
          </p>
        </form>
      ) : (
        <button onClick={onNew} className="px-3 py-1.5 text-[12px] font-semibold text-[#2D8CFF] border border-[#2D8CFF] rounded-full hover:bg-[#EAF4FF]">
          + New plan
        </button>
      )}

      <div className={draft ? "mt-4 pt-3 border-t border-[#F0F0F0]" : "mt-3"}>
        {sorted.length === 0 ? (
          <p className="text-[12px] text-[#525252]">
            No saved plans for {ticker}. Use <b>Plan</b> above the chart, <b>Plan a trade</b> on a detected setup, or <b>New plan</b>.
          </p>
        ) : (
          <ul className="divide-y divide-[#F0F0F0]">
            {sorted.map((p) => {
              const m = planMetrics({ ...p, shares: p.shares });
              const shown = shownId === p.id;
              return (
                <li key={p.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#0A0A0A]">
                      {p.direction === "long" ? "Long" : "Short"} at {price(p.entry)}
                    </span>
                    <span className="text-[12px] font-semibold tabular-nums text-[#0A0A0A]">{m.rewardRisk !== null ? ratio(m.rewardRisk) : "—"}</span>
                  </div>
                  <p className="text-[11px] tabular-nums text-[#525252]">
                    Stop <span className="text-[#F04E23]">{price(p.stop)}</span> ({p.direction === "long" ? "−" : "+"}{m.stopPct?.toFixed(1)}%) · Target{" "}
                    <span className="text-[#00B341]">{price(p.target)}</span> ({p.direction === "long" ? "+" : "−"}{m.targetPct?.toFixed(1)}%)
                    {m.loss !== null && <> · {p.shares} shares, risking {money(m.loss)}</>}
                  </p>
                  <p className="text-[11px] text-[#A3A3A3]">
                    Saved {new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {p.source && ` · from the ${SETUP_INFO[p.source.setup].name.toLowerCase()} detected ${p.source.detected}`}
                  </p>
                  {p.note && <p className="text-[12px] text-[#0A0A0A] mt-0.5 whitespace-pre-wrap break-words">{p.note}</p>}
                  <div className="flex gap-3 mt-1">
                    <button onClick={() => onShow(shown ? null : p.id)} className={linkButton}>{shown ? "Hide from chart" : "Show on chart"}</button>
                    <button onClick={() => onEdit(p)} className={linkButton} aria-label={`Edit plan at ${price(p.entry)}`}>Edit</button>
                    <button onClick={() => onDelete(p.id)} className="text-[12px] font-semibold text-[#F04E23] hover:underline" aria-label={`Delete plan at ${price(p.entry)}`}>Delete</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PanelCard>
  );
}
