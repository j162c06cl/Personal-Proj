"use client";

import { useState } from "react";
import { LEVEL_RULES } from "@/lib/marketData/levels";
import { LABEL_MAX } from "@/lib/marketData/annotations";
import { formatPercent } from "@/lib/formatters";
import PanelCard, { HowItWorks } from "./PanelCard";
import { formatBarTime } from "./drawing";

export interface LevelRow {
  id: string;
  price: number;
  role: "support" | "resistance";
  manual: boolean;
  label: string;
  /** Times price turned near this level in the bars looked at */
  touches: number;
  lastIndex: number | null;
}

const inputClass = "px-2 py-1 text-[13px] border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#2D8CFF]";
const linkButton = "text-[12px] font-semibold text-[#2D8CFF] hover:underline";

function LevelEditor({
  price,
  label,
  digits,
  submitLabel,
  onSave,
  onCancel,
}: {
  price: string;
  label: string;
  digits: number;
  submitLabel: string;
  onSave: (price: number, label: string) => void;
  onCancel?: () => void;
}) {
  const [p, setP] = useState(price);
  const [l, setL] = useState(label);
  const value = Number(p);
  const valid = p.trim() !== "" && Number.isFinite(value) && value > 0;
  return (
    <form
      className="flex items-center gap-2 flex-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(Number(value.toFixed(digits)), l.trim());
      }}
    >
      <input aria-label="Level price" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} className={`${inputClass} w-24 tabular-nums`} placeholder="Price" />
      <input aria-label="Level label" value={l} maxLength={LABEL_MAX} onChange={(e) => setL(e.target.value)} className={`${inputClass} flex-1 min-w-[90px]`} placeholder="Label (optional)" />
      <button type="submit" disabled={!valid} className="px-3 py-1 text-[12px] font-semibold bg-[#2D8CFF] text-white rounded-full disabled:opacity-40">
        {submitLabel}
      </button>
      {onCancel && <button type="button" onClick={onCancel} className={linkButton}>Cancel</button>}
    </form>
  );
}

/** Detected support and resistance plus the reader's own levels, highest price first */
export default function LevelsCard({
  rows,
  showDetected,
  onShowDetected,
  lastClose,
  digits,
  price,
  times,
  intraday,
  barsLooked,
  onAdd,
  onUpdate,
  onRemove,
}: {
  rows: LevelRow[];
  showDetected: boolean;
  onShowDetected: (on: boolean) => void;
  lastClose: number;
  digits: number;
  price: (v: number) => string;
  times: readonly number[];
  intraday: boolean;
  /** Bars the detection looked at */
  barsLooked: number;
  onAdd: (price: number, label: string) => void;
  onUpdate: (id: string, price: number, label: string) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const sorted = [...rows].sort((a, b) => b.price - a.price);
  const above = sorted.filter((r) => r.price >= lastClose);
  const below = sorted.filter((r) => r.price < lastClose);

  /** Says so when no level was detected on one side, e.g. resistance near an all-time high */
  function emptySide(role: LevelRow["role"], where: "above" | "below") {
    if (!showDetected || rows.some((r) => !r.manual && r.role === role)) return null;
    return (
      <li key={`none-${role}`} className="py-2 text-[12px] text-[#525252]">
        No {role} detected {where} the last close: nothing {where} it turned at the same price at least {LEVEL_RULES.minTouches}{" "}
        times in the last {barsLooked} bars.
      </li>
    );
  }

  function renderRow(r: LevelRow) {
    const support = r.role === "support";
    if (editing === r.id) {
      return (
        <li key={r.id} className="py-2">
          <LevelEditor price={r.price.toFixed(digits)} label={r.label} digits={digits} submitLabel="Save"
            onSave={(p, l) => { onUpdate(r.id, p, l); setEditing(null); }} onCancel={() => setEditing(null)} />
        </li>
      );
    }
    return (
      <li key={r.id} className="py-2 flex items-start gap-2.5">
        <span
          className={`mt-0.5 shrink-0 w-5 h-5 rounded-md text-[11px] font-bold flex items-center justify-center ${support ? "bg-[#00B341]/10 text-[#00B341]" : "bg-[#F04E23]/10 text-[#F04E23]"}`}
          title={support ? "Support: below the last close" : "Resistance: at or above the last close"}
        >
          {support ? "S" : "R"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap tabular-nums">
            <span className="text-[14px] font-semibold text-[#0A0A0A]">{price(r.price)}</span>
            <span className="text-[12px] text-[#525252]">{formatPercent(((r.price - lastClose) / lastClose) * 100)}</span>
            {r.manual && r.label && <span className="text-[12px] font-medium text-[#0A0A0A] truncate">{r.label}</span>}
          </div>
          <p className="text-[11px] text-[#A3A3A3]">
            {r.manual ? "Yours" : "Detected"} · {r.touches === 1 ? "1 touch" : `${r.touches} touches`}
            {r.lastIndex !== null && ` · last ${formatBarTime(times[r.lastIndex], intraday)}`}
          </p>
        </div>
        {r.manual && (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setEditing(r.id)} className={linkButton} aria-label={`Edit level ${price(r.price)}`}>Edit</button>
            <button onClick={() => onRemove(r.id)} className="text-[12px] font-semibold text-[#F04E23] hover:underline" aria-label={`Delete level ${price(r.price)}`}>Delete</button>
          </div>
        )}
      </li>
    );
  }

  return (
    <PanelCard title="Support & resistance">
      <label className="flex items-center gap-2 text-[12px] text-[#525252] cursor-pointer select-none">
        <input type="checkbox" checked={showDetected} onChange={(e) => onShowDetected(e.target.checked)} className="accent-[#2D8CFF]" />
        Show detected levels (dashed lines)
      </label>

      <ul className="mt-1 divide-y divide-[#F0F0F0]">
        {above.map(renderRow)}
        {emptySide("resistance", "above")}
        <li className="py-1.5 flex items-center gap-2 text-[11px] text-[#A3A3A3] tabular-nums">
          <span className="h-px flex-1 bg-[#E5E5E5]" />
          Last close {price(lastClose)}
          <span className="h-px flex-1 bg-[#E5E5E5]" />
        </li>
        {below.map(renderRow)}
        {emptySide("support", "below")}
      </ul>

      <div className="mt-2">
        {adding ? (
          <LevelEditor price={lastClose.toFixed(digits)} label="" digits={digits} submitLabel="Add"
            onSave={(p, l) => { onAdd(p, l); setAdding(false); }} onCancel={() => setAdding(false)} />
        ) : (
          <button onClick={() => setAdding(true)} className={linkButton}>+ Add a level by price</button>
        )}
      </div>

      <HowItWorks summary="How levels are found">
        <p>
          A <b>swing high</b> is a bar whose high is the highest within {LEVEL_RULES.pivotBars} bars on either side; a{" "}
          <b>swing low</b> is the same for lows. Each is a place where price turned.
        </p>
        <p>
          Swing points within half an average bar&apos;s range of each other are grouped into one level, at their average price.
          The number of swing points in the group is its <b>touches</b>. Only the last {LEVEL_RULES.lookbackBars} bars are looked at.
        </p>
        <p>
          A level needs at least {LEVEL_RULES.minTouches} touches. The {LEVEL_RULES.perSide} nearest below the last close are
          shown as support and the {LEVEL_RULES.perSide} nearest above as resistance. Your own levels get touch counts by the same rule.
        </p>
        <p>The newest {LEVEL_RULES.pivotBars} bars can&apos;t form a swing point yet, so a fresh turn shows up a few bars later.</p>
      </HowItWorks>
    </PanelCard>
  );
}
