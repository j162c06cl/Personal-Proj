"use client";

import { useState } from "react";
import { SETUP_INFO, SETUP_ORDER, SetupType } from "@/lib/marketData/setups";
import {
  DEFAULT_EVAL_CONFIG, EVAL_PARAMS, EvalConfig, Evaluation, MIN_SAMPLE, SKIP_TEXT, SetupStats, SkipReason, TradeRecord,
  sanitizeEvalConfig,
} from "@/lib/marketData/evaluation";
import { HowItWorks } from "./PanelCard";
import { NumberField } from "./SetupRulesPanel";
import { formatBarTime } from "./drawing";

export const tradeKey = (t: TradeRecord) => `${t.type}:${t.signal}`;

const PAGE = 20;
const signed = (v: number, digits: number, unit = "") => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}${unit}`;
const pct = (v: number | null) => (v === null ? "—" : signed(v, 1, "%"));
const rr = (v: number | null) => (v === null ? "—" : signed(v, 2, "R"));
const tone = (v: number | null) => (v === null || v === 0 ? "" : v > 0 ? "text-[#00B341]" : "text-[#F04E23]");

const RESULT: Record<TradeRecord["outcome"], { label: string; cls: string }> = {
  target: { label: "Target", cls: "bg-[#E8F8EE] text-[#00872F]" },
  stop: { label: "Stop", cls: "bg-[#FDEDE8] text-[#C93A16]" },
  time: { label: "Time", cls: "bg-[#F5F5F5] text-[#525252]" },
  open: { label: "Open", cls: "bg-[#EAF3FF] text-[#1A6FD8]" },
};

function StatsRow({ name, s, strong }: { name: string; s: SetupStats; strong?: boolean }) {
  const few = s.trades > 0 && s.trades < MIN_SAMPLE;
  const share = (n: number) => (s.trades ? `${n} (${Math.round((n / s.trades) * 100)}%)` : "—");
  return (
    <tr className={`border-t border-[#F0F0F0] ${strong ? "font-semibold" : ""}`}>
      <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-[#0A0A0A] whitespace-nowrap">
        {name}
        {few && <span className="ml-1.5 text-[10px] font-semibold uppercase text-[#B45309]" title={`Fewer than ${MIN_SAMPLE} closed trades`}>few trades</span>}
      </th>
      <td className="px-2 text-right">{s.trades}{s.open > 0 && <span className="text-[#A3A3A3]"> +{s.open} open</span>}</td>
      <td className="px-2 text-right">{share(s.targetFirst)}</td>
      <td className="px-2 text-right">{share(s.stopFirst)}</td>
      <td className="px-2 text-right">{share(s.timeExits)}</td>
      <td className="px-2 text-right">{s.winRate === null ? "—" : `${Math.round(s.winRate)}%`}</td>
      <td className={`px-2 text-right ${tone(s.avgReturnPct)}`}>{pct(s.avgReturnPct)}</td>
      <td className={`px-2 text-right ${tone(s.medianReturnPct)}`}>{pct(s.medianReturnPct)}</td>
      <td className={`px-2 text-right ${tone(s.avgR)}`}>{rr(s.avgR)}</td>
      <td className={`px-2 text-right ${tone(s.trades ? s.totalR : null)}`}>{s.trades ? rr(s.totalR) : "—"}</td>
      <td className="px-2 text-right">{s.profitFactor === null ? "—" : s.profitFactor.toFixed(2)}</td>
      <td className="px-2 text-right">{s.avgMfeR === null ? "—" : `${s.avgMfeR.toFixed(2)}R`}</td>
      <td className="px-2 text-right">{s.avgMaeR === null ? "—" : `${s.avgMaeR.toFixed(2)}R`}</td>
      <td className="pl-2 text-right">{s.avgBars === null ? "—" : s.avgBars.toFixed(1)}</td>
    </tr>
  );
}

export default function TrackRecordCard({
  evaluation,
  ticker,
  timeframeLabel,
  times,
  intraday,
  latestForming,
  rulesChanged,
  price,
  config,
  onConfigChange,
  shownKey,
  onShow,
}: {
  evaluation: Evaluation;
  ticker: string;
  timeframeLabel: string;
  times: number[];
  intraday: boolean;
  latestForming: boolean;
  /** How many setup rules differ from the defaults */
  rulesChanged: number;
  price: (v: number) => string;
  config: EvalConfig;
  onConfigChange: (c: EvalConfig) => void;
  shownKey: string | null;
  onShow: (t: TradeRecord | null) => void;
}) {
  const [filter, setFilter] = useState<SetupType | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  const { trades, skipped, stats, overall } = evaluation;
  const when = (i: number) => formatBarTime(times[i], intraday);
  const list = trades.filter((t) => filter === "all" || t.type === filter).slice().reverse();
  const changedEval = EVAL_PARAMS.some((p) => config[p.key] !== DEFAULT_EVAL_CONFIG[p.key]);
  const set = (key: keyof EvalConfig, v: number) => onConfigChange(sanitizeEvalConfig({ ...config, [key]: v }));

  const skipCounts = new Map<SkipReason, number>();
  for (const s of skipped) skipCounts.set(s.reason, (skipCounts.get(s.reason) ?? 0) + 1);

  return (
    <section className="mt-4 border border-[#E5E5E5] rounded-2xl p-4" aria-labelledby="track-record-title">
      <div className="flex items-baseline justify-between gap-x-3 gap-y-1 flex-wrap">
        <h2 id="track-record-title" className="text-[16px] font-bold text-[#0A0A0A]">Setup track record</h2>
        <span className="text-[11px] text-[#A3A3A3]">
          {ticker} · {timeframeLabel} bars · {when(evaluation.from)} – {when(evaluation.to)} · {evaluation.to - evaluation.from + 1} bars
        </span>
      </div>
      <p className="mt-1 text-[13px] text-[#525252] max-w-3xl">
        Every setup detected on this chart, replayed as a trade with the fixed rules below and only the bars known at the time.
        It shows how these rules did on this stock in the past. It doesn&apos;t predict how they will do next.
      </p>

      {/* ── The trade rules ── */}
      <div className="mt-3 rounded-xl bg-[#FAFAFA] border border-[#F0F0F0] px-3 py-2.5 text-[12px] text-[#0A0A0A]">
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
          <span><b>Entry</b> next bar&apos;s open</span>
          <span><b>Stop</b> the setup&apos;s invalidation level</span>
          {EVAL_PARAMS.map((p) => (
            <label key={p.key} className="flex items-center gap-1.5" title={p.help}>
              <b>{p.label}</b>
              <NumberField def={p} value={config[p.key]} onCommit={(v) => set(p.key, v)} />
              <span className="text-[#525252]">{p.unit}</span>
            </label>
          ))}
          {changedEval && (
            <button onClick={() => onConfigChange(DEFAULT_EVAL_CONFIG)} className="text-[12px] font-semibold text-[#2D8CFF] hover:underline">
              Reset
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-[#525252]">
          Bull flags are traded once they close above the flag. One trade at a time for each setup type.
          {rulesChanged > 0 && <> Uses your setup rules ({rulesChanged} changed from the defaults).</>}
          {latestForming && <> The latest bar is still forming and is left out until it closes.</>}
        </p>
      </div>

      {/* ── Statistics ── */}
      <h3 className="mt-4 text-[13px] font-bold text-[#0A0A0A]">Performance by setup</h3>
      {overall.trades + overall.open === 0 ? (
        <p className="mt-1 text-[13px] text-[#525252]">No setups could be traded in these bars.</p>
      ) : (
        <div className="relative mt-1 overflow-x-auto">
          <table className="w-full text-[12px] tabular-nums text-[#0A0A0A] whitespace-nowrap">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[#A3A3A3]">
                <th scope="col" className="py-1 pr-3 text-left font-semibold">Setup</th>
                <th scope="col" className="px-2 text-right font-semibold">Trades</th>
                <th scope="col" className="px-2 text-right font-semibold">Target first</th>
                <th scope="col" className="px-2 text-right font-semibold">Stop first</th>
                <th scope="col" className="px-2 text-right font-semibold">Time exit</th>
                <th scope="col" className="px-2 text-right font-semibold" title="Closed trades with a positive return">Win rate</th>
                <th scope="col" className="px-2 text-right font-semibold">Avg return</th>
                <th scope="col" className="px-2 text-right font-semibold">Median</th>
                <th scope="col" className="px-2 text-right font-semibold" title="Average result per trade in units of risk (expectancy)">Avg R</th>
                <th scope="col" className="px-2 text-right font-semibold">Total R</th>
                <th scope="col" className="px-2 text-right font-semibold" title="Gains ÷ losses">Profit factor</th>
                <th scope="col" className="px-2 text-right font-semibold" title="Average maximum favourable excursion">Avg MFE</th>
                <th scope="col" className="px-2 text-right font-semibold" title="Average maximum adverse excursion">Avg MAE</th>
                <th scope="col" className="pl-2 text-right font-semibold">Avg bars</th>
              </tr>
            </thead>
            <tbody>
              {SETUP_ORDER.map((t) => <StatsRow key={t} name={SETUP_INFO[t].name} s={stats[t]} />)}
              <StatsRow name="All setups" s={overall} strong />
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 space-y-1 text-[12px] text-[#525252]">
        {evaluation.stockChangePct !== null && (
          <p>
            For comparison, {ticker} itself moved <b className={tone(evaluation.stockChangePct)}>{pct(evaluation.stockChangePct)}</b> over
            these bars. In a rising stock most long setups look good, so a positive average may say more about the stock than the setup.
          </p>
        )}
        {overall.trades > 0 && overall.trades < MIN_SAMPLE * SETUP_ORDER.length && (
          <p>Setups marked &ldquo;few trades&rdquo; have fewer than {MIN_SAMPLE} closed trades, too few to tell skill from luck.</p>
        )}
        {skipped.length > 0 && (
          <p>
            {skipped.length} more signal{skipped.length === 1 ? " wasn't" : "s weren't"} traded:{" "}
            {Array.from(skipCounts, ([reason, n]) => `${n} because ${SKIP_TEXT[reason]}`).join("; ")}.
          </p>
        )}
      </div>

      {/* ── Every trade ── */}
      {trades.length > 0 && (
        <>
          <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[13px] font-bold text-[#0A0A0A]">Historical setups</h3>
            <label className="flex items-center gap-2 text-[12px] text-[#525252]">
              Show
              <select
                value={filter}
                onChange={(e) => { setFilter(e.target.value as SetupType | "all"); setLimit(PAGE); }}
                className="px-2 py-1 text-[12px] text-[#0A0A0A] bg-white border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#2D8CFF]"
              >
                <option value="all">All setups ({trades.length})</option>
                {SETUP_ORDER.map((t) => (
                  <option key={t} value={t}>{SETUP_INFO[t].name} ({trades.filter((x) => x.type === t).length})</option>
                ))}
              </select>
            </label>
          </div>
          <div className="relative mt-1 overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums text-[#0A0A0A] whitespace-nowrap">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-[#A3A3A3]">
                  <th scope="col" className="py-1 pr-3 text-left font-semibold">Detected</th>
                  <th scope="col" className="px-2 text-left font-semibold">Setup</th>
                  <th scope="col" className="px-2 text-right font-semibold">Entry</th>
                  <th scope="col" className="px-2 text-right font-semibold">Stop</th>
                  <th scope="col" className="px-2 text-right font-semibold">Target</th>
                  <th scope="col" className="px-2 text-left font-semibold">Result</th>
                  <th scope="col" className="px-2 text-right font-semibold">Exit</th>
                  <th scope="col" className="px-2 text-right font-semibold">Return</th>
                  <th scope="col" className="px-2 text-right font-semibold">R</th>
                  <th scope="col" className="px-2 text-right font-semibold">MFE</th>
                  <th scope="col" className="px-2 text-right font-semibold">MAE</th>
                  <th scope="col" className="px-2 text-right font-semibold">Bars</th>
                  <th scope="col" className="pl-2"><span className="sr-only">Chart</span></th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((t) => {
                  const key = tradeKey(t);
                  const shown = key === shownKey;
                  const res = RESULT[t.outcome];
                  const note = t.sameBar ? "Stop and target in the same bar; counted as the stop"
                    : t.gap ? `Opened past the ${t.outcome}, so filled at the open`
                    : t.outcome === "open" ? `Still open: return so far at the latest close` : undefined;
                  return (
                    <tr key={key} className={`border-t border-[#F0F0F0] ${shown ? "bg-[#F3EEFF]" : ""}`} data-trade={key}>
                      <td className="py-1.5 pr-3">{when(t.signal)}</td>
                      <td className="px-2">{SETUP_INFO[t.type].name}</td>
                      <td className="px-2 text-right" title={`Opened ${when(t.entryIndex)}`}>{price(t.entry)}</td>
                      <td className="px-2 text-right" title={t.stopBasis === "invalidation" ? t.check.invalidation.text : `${config.fallbackStopRanges} average bar ranges below the entry`}>
                        {price(t.stop)}
                      </td>
                      <td className="px-2 text-right">{price(t.target)}</td>
                      <td className="px-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${res.cls}`} title={note}>
                          {res.label}{t.gap ? " · gap" : t.sameBar ? " · same bar" : ""}
                        </span>
                      </td>
                      <td className="px-2 text-right" title={t.outcome === "open" ? "Latest close" : `Closed ${when(t.exitIndex)}`}>{price(t.exit)}</td>
                      <td className={`px-2 text-right ${tone(t.returnPct)}`}>{pct(t.returnPct)}</td>
                      <td className={`px-2 text-right ${tone(t.r)}`}>{rr(t.r)}</td>
                      <td className="px-2 text-right" title={`${t.mfeR.toFixed(2)}R`}>{pct(t.mfePct)}</td>
                      <td className="px-2 text-right" title={`${t.maeR.toFixed(2)}R`}>{pct(-t.maePct)}</td>
                      <td className="px-2 text-right">{t.bars}</td>
                      <td className="pl-2 text-right">
                        <button
                          onClick={() => onShow(shown ? null : t)}
                          aria-pressed={shown}
                          aria-label={`${shown ? "Hide" : "Show"} the ${SETUP_INFO[t.type].name.toLowerCase()} from ${when(t.signal)} on the chart`}
                          className="text-[12px] font-semibold text-[#2D8CFF] hover:underline"
                        >
                          {shown ? "Hide" : "Show"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {list.length > limit && (
            <button onClick={() => setLimit(limit + PAGE)} className="mt-2 text-[12px] font-semibold text-[#2D8CFF] hover:underline">
              Show {Math.min(PAGE, list.length - limit)} more ({list.length - limit} not shown)
            </button>
          )}
        </>
      )}

      <HowItWorks summary="How these trades are worked out">
        <p>
          <b>Signal.</b> A setup counts from the first bar it was detected on, judged with only that bar and the ones before it, exactly
          as the setups panel does. Bull flags count from the first bar that closes above the flag, since a flag still forming hasn&apos;t
          broken out. While a trade from a setup type is open, its later signals aren&apos;t traded, so one move isn&apos;t counted twice.
        </p>
        <p>
          <b>Entry, stop and target.</b> The trade enters at the open of the bar after the signal, the first price anyone could have
          traded at. The stop is the price that invalidates the setup by its own rules (the broken level, the pullback low, the flag low or
          the bounce low); golden crosses have none, so their stop is {config.fallbackStopRanges} average bar ranges below the entry. The
          target is {config.targetR} times the risk above the entry. If the next bar opens at or below the stop, the trade isn&apos;t taken.
        </p>
        <p>
          <b>Exit.</b> Each bar from the entry on is checked in turn: a low at or below the stop exits at the stop, a high at or above the
          target exits at the target, and after {config.maxBars} bars the trade exits at that bar&apos;s close. A bar that opens beyond the
          stop or target exits at its open, which can be worse than the stop. Within a bar the order of the high and low is unknown,
          so a bar that reaches both counts as the stop. Trades still running at the latest bar are listed as open and left out of the
          statistics.
        </p>
        <p>
          <b>Measures.</b> Return is the exit against the entry. R is the result in units of risk (entry minus stop), so −1R is a full
          stop-out. MFE and MAE are the best and worst prices reached while in the trade. Win rate counts closed trades with a positive
          return. Avg R is the expectancy: the average result per trade, in units of risk.
        </p>
        <p>
          <b>Limits.</b> No commissions, slippage beyond gaps, dividends or taxes. Prices are adjusted for splits but not dividends. Only
          the bars on this chart are used, so the sample is small, especially on intraday charts (60 days of 5- and 15-minute bars). The
          stock is one that still trades today, which flatters any test. Adjusting the rules until the numbers look good fits them to the
          past, and they&apos;ll likely do worse on new data.
        </p>
      </HowItWorks>
    </section>
  );
}
