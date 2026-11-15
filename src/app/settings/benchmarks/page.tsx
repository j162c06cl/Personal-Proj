"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import SettingsTabs from "@/components/SettingsTabs";
import {
  BAND_DEFS, Band, BandDef, Benchmarks, CallStrategy, DEFAULT_BENCHMARKS, FIXED_RULES, ScoredTab, validBand,
} from "@/lib/ratings";

const TAB_LABEL: Record<ScoredTab, string> = {
  financials: "Financials",
  valuation: "Valuation",
  technical: "Technical",
  risks: "Risks",
};

const TAB_HINT: Record<ScoredTab, string> = {
  financials: "Growth, profitability and balance-sheet strength.",
  valuation: "How expensive the stock is. Fast growers often look red here; loosen these if you invest in growth.",
  technical: "What the chart says about momentum.",
  risks: "How bumpy the ride is likely to be.",
};

const STRATEGY_LABEL: Record<CallStrategy, string> = { "long-term": "Long-term", swing: "Swing trade" };

const sameBand = (a: Band, b: Band) => a.good === b.good && a.bad === b.bad;

// ── Inputs ──────────────────────────────────────────────────────────────────

/**
 * A number box that only saves values that pass `validate`. While the text is
 * invalid it shows why; on blur it falls back to the saved value.
 */
function NumField({
  value, onCommit, validate, unit, step = 1, label, tone, prefix,
}: {
  value: number;
  onCommit: (v: number) => void;
  validate?: (v: number) => string | null;
  unit?: string;
  step?: number;
  label?: string;
  tone?: "good" | "bad";
  prefix?: string;
}) {
  const [text, setText] = useState(String(value));
  const parsed = text.trim() === "" ? NaN : Number(text);
  const error = !Number.isFinite(parsed) ? "Enter a number" : validate?.(parsed) ?? null;

  // Follow outside changes (e.g. a reset)
  useEffect(() => {
    setText((t) => (Number(t) === value && t.trim() !== "" ? t : String(value)));
  }, [value]);

  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${tone === "good" ? "text-[#00B341]" : tone === "bad" ? "text-[#F04E23]" : "text-[#525252]"}`}>
          {label}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        {prefix && <span className="text-[14px] text-[#525252]">{prefix}</span>}
        <input
          type="number"
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = e.target.value.trim() === "" ? NaN : Number(e.target.value);
            if (Number.isFinite(v) && !validate?.(v)) onCommit(v);
          }}
          onBlur={() => { if (error) setText(String(value)); }}
          className={`w-24 px-3 py-2 rounded-xl border bg-white text-[14px] font-semibold tabular-nums text-[#0A0A0A] outline-none transition-colors ${
            error ? "border-[#F04E23]" : "border-[#E5E5E5] focus:border-[#2D8CFF]"
          }`}
        />
        {unit && <span className="text-[14px] text-[#525252]">{unit}</span>}
      </span>
      {error && <span className="text-[11px] font-medium text-[#F04E23] max-w-[180px]">{error}</span>}
    </label>
  );
}

function Dot({ tone }: { tone: "good" | "neutral" | "bad" }) {
  const c = tone === "good" ? "bg-[#00B341]" : tone === "bad" ? "bg-[#F04E23]" : "bg-[#A3A3A3]";
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} aria-hidden />;
}

/** "Under 15 green · 15–30 grey · over 30 red", in the order the zones fall */
function Zones({ def, band }: { def: BandDef; band: Band }) {
  const u = def.unit === "%" ? "%" : def.unit === "×" ? "×" : "";
  const g = `${band.good}${u}`;
  const b = `${band.bad}${u}`;
  const parts: { tone: "good" | "neutral" | "bad"; text: string }[] =
    def.key === "rsi"
      ? [{ tone: "neutral", text: `under ${g}` }, { tone: "good", text: `${g} to ${b}` }, { tone: "bad", text: `${b}+` }]
      : def.dir === "lower"
        ? [{ tone: "good", text: `under ${g}` }, { tone: "neutral", text: `${g} to ${b}` }, { tone: "bad", text: `over ${b}` }]
        : [{ tone: "good", text: `${g}+` }, { tone: "neutral", text: `${b} to ${g}` }, { tone: "bad", text: `under ${b}` }];
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#525252]">
      {parts
        .filter((p) => p.tone !== "neutral" || band.good !== band.bad)
        .map((p) => (
          <span key={p.tone} className="inline-flex items-center gap-1.5"><Dot tone={p.tone} />{p.text}</span>
        ))}
    </p>
  );
}

function BandRow({ def, band, onChange }: { def: BandDef; band: Band; onChange: (b: Band) => void }) {
  const dflt = DEFAULT_BENCHMARKS.bands[def.key];
  const changed = !sameBand(band, dflt);
  const u = def.unit === "%" ? "%" : def.unit === "×" ? "×" : undefined;
  const step = def.unit === "%" || Math.max(Math.abs(dflt.good), Math.abs(dflt.bad)) >= 10 ? 1 : 0.1;
  const orderMsg = def.key === "rsi"
    ? "Green must start below the overbought line"
    : def.dir === "lower" ? "Green line must be at or below the red line" : "Green line must be at or above the red line";

  return (
    <div className="py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-semibold text-[#0A0A0A]">
          {def.label}
          {changed && <span className="ml-2 text-[11px] font-semibold text-[#2D8CFF] bg-[#EAF4FF] px-1.5 py-0.5 rounded-md align-middle">Edited</span>}
        </p>
        {changed && (
          <button onClick={() => onChange(dflt)} className="text-[12px] font-semibold text-[#525252] hover:text-[#0A0A0A] shrink-0">
            Reset to {dflt.good} / {dflt.bad}
          </button>
        )}
      </div>
      <p className="text-[12px] text-[#737373] mt-0.5">{def.why}</p>
      <div className="flex flex-wrap items-start gap-4 mt-3">
        <NumField
          label={def.goodLabel ?? (def.dir === "lower" ? "Green under" : "Green from")}
          tone="good"
          value={band.good}
          unit={u}
          step={step}
          validate={(v) => (validBand(def, { good: v, bad: band.bad }) ? null : orderMsg)}
          onCommit={(v) => onChange({ ...band, good: v })}
        />
        <NumField
          label={def.badLabel ?? (def.dir === "lower" ? "Red over" : "Red under")}
          tone="bad"
          value={band.bad}
          unit={u}
          step={step}
          validate={(v) => (validBand(def, { good: band.good, bad: v }) ? null : orderMsg)}
          onCommit={(v) => onChange({ ...band, bad: v })}
        />
      </div>
      <div className="mt-2.5"><Zones def={def} band={band} /></div>
    </div>
  );
}

function Card({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[#E5E5E5] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold text-[#0A0A0A]">{title}</h2>
          {subtitle && <p className="text-[13px] text-[#525252] mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function BenchmarksPage() {
  const { settings, saveSettings } = useSettings();
  const [savedFlash, setSavedFlash] = useState(false);
  // Bumped on "reset all" so every box re-reads its value, even ones mid-edit
  const [version, setVersion] = useState(0);

  if (!settings) return null;
  const bm = settings.benchmarks;

  function update(next: Benchmarks) {
    saveSettings({ ...settings!, benchmarks: next });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  const setBand = (key: BandDef["key"], band: Band) => update({ ...bm, bands: { ...bm.bands, [key]: band } });
  const setWeight = (strat: CallStrategy, tab: ScoredTab, v: number) =>
    update({ ...bm, weights: { ...bm.weights, [strat]: { ...bm.weights[strat], [tab]: v } } });

  const anyChanged = JSON.stringify(bm) !== JSON.stringify(DEFAULT_BENCHMARKS);
  const callChanged =
    JSON.stringify(bm.weights) !== JSON.stringify(DEFAULT_BENCHMARKS.weights) ||
    bm.callThreshold !== DEFAULT_BENCHMARKS.callThreshold ||
    bm.minRated !== DEFAULT_BENCHMARKS.minRated;
  const strategies = Object.keys(bm.weights) as CallStrategy[];
  const tabs = Object.keys(TAB_LABEL) as ScoredTab[];

  return (
    <div className="max-w-3xl">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-[#0A0A0A]">Settings</h1>
          <p className="text-[14px] text-[#525252] mt-1">Everything here is stored on this device only.</p>
        </div>
        <span className={`text-[13px] font-semibold text-[#00B341] transition-opacity ${savedFlash ? "opacity-100" : "opacity-0"}`}>
          ✓ Saved
        </span>
      </div>

      <SettingsTabs />

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <p className="text-[14px] text-[#525252] max-w-xl">
          These lines decide whether each number on a stock page shows <span className="font-semibold text-[#00B341]">green</span>,{" "}
          <span className="font-semibold text-[#737373]">grey</span> or <span className="font-semibold text-[#F04E23]">red</span>, and
          those colours decide the Buy / Hold / Sell call. The defaults are common rules of thumb for a typical company, not tuned
          to any sector.
        </p>
        {anyChanged && (
          <button
            onClick={() => {
              if (!window.confirm("Put every benchmark back to its default?")) return;
              update(DEFAULT_BENCHMARKS);
              setVersion((v) => v + 1);
            }}
            className="self-start shrink-0 px-3 py-1.5 text-[13px] font-semibold text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#2D8CFF] hover:text-[#0A0A0A] rounded-xl transition-colors"
          >
            Reset all to defaults
          </button>
        )}
      </div>

      <div className="space-y-5" key={version}>
        <Card
          title="The Buy / Hold / Sell call"
          subtitle="Each tab scores (green − red) ÷ numbers rated, from −1 (all red) to +1 (all green). The tab scores are then averaged using these weights."
          action={callChanged ? (
            <button
              onClick={() => {
                update({ ...bm, weights: DEFAULT_BENCHMARKS.weights, callThreshold: DEFAULT_BENCHMARKS.callThreshold, minRated: DEFAULT_BENCHMARKS.minRated });
                setVersion((v) => v + 1);
              }}
              className="text-[12px] font-semibold text-[#525252] hover:text-[#0A0A0A] shrink-0"
            >
              Reset
            </button>
          ) : undefined}
        >
          <div className="overflow-x-auto">
            <table className="text-[13px]">
              <thead>
                <tr>
                  <th className="text-left pr-4 pb-2 text-[11px] font-semibold text-[#525252] uppercase tracking-wider">Tab</th>
                  {strategies.map((s) => (
                    <th key={s} className="text-left pr-4 pb-2 text-[11px] font-semibold text-[#525252] uppercase tracking-wider">{STRATEGY_LABEL[s]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabs.map((t) => (
                  <tr key={t}>
                    <td className="pr-4 py-1.5 font-semibold text-[#0A0A0A]">{TAB_LABEL[t]}</td>
                    {strategies.map((s) => (
                      <td key={s} className="pr-4 py-1.5">
                        <NumField
                          value={bm.weights[s][t]}
                          unit="%"
                          step={5}
                          validate={(v) => {
                            if (v < 0 || v > 100) return "Between 0 and 100";
                            const others = tabs.filter((x) => x !== t).reduce((a, x) => a + bm.weights[s][x], 0);
                            return others + v > 0 ? null : "At least one tab needs weight";
                          }}
                          onCommit={(v) => setWeight(s, t, v)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="pr-4 pt-2 text-[12px] text-[#737373]">Total</td>
                  {strategies.map((s) => {
                    const total = tabs.reduce((a, t) => a + bm.weights[s][t], 0);
                    return (
                      <td key={s} className={`pr-4 pt-2 text-[12px] font-semibold tabular-nums ${total === 100 ? "text-[#737373]" : "text-[#92400E]"}`}>
                        {total}%{total !== 100 && <span className="font-normal"> (scaled to 100)</span>}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-5 pt-4 border-t border-[#F0F0F0] flex flex-wrap gap-6">
            <div className="space-y-1.5">
              <NumField
                label="Buy at or above"
                prefix="+"
                value={bm.callThreshold}
                step={0.05}
                validate={(v) => (v > 0 && v <= 1 ? null : "Between 0 and 1")}
                onCommit={(v) => update({ ...bm, callThreshold: v })}
              />
              <p className="text-[12px] text-[#737373] max-w-[260px]">
                Sell at or below −{bm.callThreshold}. Anything in between is Hold. Lower it for more Buy and Sell calls.
              </p>
            </div>
            <div className="space-y-1.5">
              <NumField
                label="Fewest numbers to judge"
                value={bm.minRated}
                validate={(v) => (Number.isInteger(v) && v >= 1 && v <= 40 ? null : "A whole number from 1 to 40")}
                onCommit={(v) => update({ ...bm, minRated: v })}
              />
              <p className="text-[12px] text-[#737373] max-w-[260px]">Below this, the stock page says &ldquo;Not enough data&rdquo; instead of a call.</p>
            </div>
          </div>
        </Card>

        {tabs.map((t) => (
          <Card key={t} title={TAB_LABEL[t]} subtitle={TAB_HINT[t]}>
            <div className="divide-y divide-[#F0F0F0]">
              {BAND_DEFS.filter((d) => d.tab === t).map((d) => (
                <BandRow key={d.key} def={d} band={bm.bands[d.key]} onChange={(b) => setBand(d.key, b)} />
              ))}
            </div>
          </Card>
        ))}

        <Card title="Fixed rules" subtitle="These are yes-or-no signals with no line to move, so they can't be edited.">
          <ul className="divide-y divide-[#F0F0F0]">
            {FIXED_RULES.map((f) => (
              <li key={f.label} className="py-2.5">
                <p className="text-[13px] font-semibold text-[#0A0A0A]">{f.label}</p>
                <p className="text-[12px] text-[#737373] mt-0.5">{f.rule}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
