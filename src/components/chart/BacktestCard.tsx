"use client";

import { useState } from "react";
import { SETUP_INFO, SETUP_ORDER, SetupType } from "@/lib/marketData/setups";
import { SKIP_TEXT, SkipReason } from "@/lib/marketData/evaluation";
import {
  AccountResult, AccountStats, AccountTrade, BACKTEST_PARAMS, Backtest, BacktestConfig, DEFAULT_BACKTEST_CONFIG, MIN_SAMPLE,
  PeriodId, changedBacktestSettings, sanitizeBacktestConfig,
} from "@/lib/marketData/backtest";
import { HowItWorks } from "./PanelCard";
import { NumberField } from "./SetupRulesPanel";
import BalanceChart from "./BalanceChart";
import { formatBarTime } from "./drawing";

export type AccountKey = SetupType | "all";

/** Identifies a trade on the chart: which period and account it's from, and its signal */
export interface ShownTrade {
  period: PeriodId;
  account: AccountKey;
  type: SetupType;
  signal: number;
}

export const accountOf = (bt: Backtest, period: PeriodId, key: AccountKey): AccountResult =>
  key === "all" ? bt.periods[period].combined : bt.periods[period].accounts[key];

export const findShownTrade = (bt: Backtest | null, s: ShownTrade | null): AccountTrade | null =>
  (bt && s && accountOf(bt, s.period, s.account).trades.find((t) => t.type === s.type && t.signal === s.signal)) || null;

const PAGE = 20;
const signed = (v: number, digits: number, unit = "") => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}${unit}`;
const pct = (v: number | null) => (v === null ? "—" : signed(v, 1, "%"));
const rr = (v: number | null) => (v === null ? "—" : signed(v, 2, "R"));
const ratio = (v: number | null) => (v === null ? "—" : v.toFixed(2));
const tone = (v: number | null) => (v === null || Math.abs(v) < 1e-9 ? "" : v > 0 ? "text-[#00B341]" : "text-[#F04E23]");
const few = (s: AccountStats) => s.trades < MIN_SAMPLE;

const RESULT: Record<AccountTrade["outcome"], { label: string; cls: string }> = {
  target: { label: "Target", cls: "bg-[#E8F8EE] text-[#00872F]" },
  stop: { label: "Stop", cls: "bg-[#FDEDE8] text-[#C93A16]" },
  time: { label: "Time", cls: "bg-[#F5F5F5] text-[#525252]" },
  open: { label: "Open", cls: "bg-[#EAF3FF] text-[#1A6FD8]" },
};

const PERIOD_NAME: Record<PeriodId, string> = { whole: "Whole history", training: "Training", testing: "Testing" };
const accountName = (k: AccountKey) => (k === "all" ? "All setups together" : SETUP_INFO[k].name);

function Th({ children, left, title }: { children: React.ReactNode; left?: boolean; title?: string }) {
  return <th scope="col" title={title} className={`py-1 px-2 first:pl-0 font-semibold ${left ? "text-left" : "text-right"}`}>{children}</th>;
}

export default function BacktestCard({
  backtest, ticker, timeframeLabel, times, intraday, latestForming, rulesChanged, price, money, onConfigChange, shown, onShow,
}: {
  backtest: Backtest;
  ticker: string;
  timeframeLabel: string;
  times: number[];
  intraday: boolean;
  latestForming: boolean;
  /** How many setup rules differ from the defaults */
  rulesChanged: number;
  price: (v: number) => string;
  money: (v: number) => string;
  onConfigChange: (c: BacktestConfig) => void;
  shown: ShownTrade | null;
  onShow: (t: ShownTrade | null) => void;
}) {
  const [period, setPeriod] = useState<PeriodId>("whole");
  const [account, setAccount] = useState<AccountKey>("all");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState(false);
  const cfg = backtest.config;
  const p = backtest.periods[period];
  const acc = accountOf(backtest, period, account);
  const when = (i: number) => formatBarTime(times[i], intraday);
  const smoney = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${money(Math.abs(v))}`);
  const changed = changedBacktestSettings(cfg);
  const set = (key: keyof BacktestConfig, v: number | boolean) => onConfigChange(sanitizeBacktestConfig({ ...cfg, [key]: v }));
  const span = (id: PeriodId) => `${when(backtest.periods[id].from)} – ${when(backtest.periods[id].to)}`;
  const list = acc.trades.slice().reverse();

  const skipCounts = new Map<SkipReason, number>();
  for (const s of acc.skipped) skipCounts.set(s.reason, (skipCounts.get(s.reason) ?? 0) + 1);

  function statsRow(k: AccountKey) {
    const s = accountOf(backtest, period, k).stats;
    const active = k === account;
    return (
      <tr key={k} className={`border-t border-[#F0F0F0] ${k === "all" ? "font-semibold" : ""} ${active ? "bg-[#F3EEFF]" : ""}`}>
        <th scope="row" className="py-1.5 pr-2 text-left whitespace-nowrap">
          <button
            onClick={() => { setAccount(k); setLimit(PAGE); }}
            aria-pressed={active}
            className="font-semibold text-[#0A0A0A] hover:text-[#2D8CFF] hover:underline text-left"
          >
            {accountName(k)}
          </button>
          {s.trades > 0 && few(s) && <span className="ml-1.5 text-[10px] font-semibold uppercase text-[#B45309]" title={`Fewer than ${MIN_SAMPLE} closed trades`}>few trades</span>}
        </th>
        <td className="px-2 text-right">{s.trades}{s.open > 0 && <span className="text-[#A3A3A3]"> +{s.open} open</span>}</td>
        <td className="px-2 text-right">{s.winRate === null ? "—" : `${Math.round(s.winRate)}%`}</td>
        <td className={`px-2 text-right ${tone(s.avgWin)}`}>{smoney(s.avgWin)}</td>
        <td className={`px-2 text-right ${tone(s.avgLoss)}`}>{smoney(s.avgLoss)}</td>
        <td className={`px-2 text-right ${tone(s.avgPnl)}`}>{smoney(s.avgPnl)}</td>
        <td className={`px-2 text-right ${tone(s.avgR)}`}>{rr(s.avgR)}</td>
        <td className="px-2 text-right">{s.avgPlannedRR === null ? "—" : `1 : ${s.avgPlannedRR.toFixed(2)}`}</td>
        <td className="px-2 text-right">{ratio(s.payoff)}</td>
        <td className="px-2 text-right">{ratio(s.profitFactor)}</td>
        <td className="px-2 text-right" title={s.drawdownFrom !== null && s.drawdownTo !== null ? `${when(s.drawdownFrom)} to ${when(s.drawdownTo)}` : undefined}>
          {s.maxDrawdownPct > 0 ? `−${s.maxDrawdownPct.toFixed(1)}%` : "0%"}
        </td>
        <td className={`px-2 text-right ${tone(s.returnPct)}`}>{pct(s.returnPct)}</td>
        <td className="px-2 text-right" title={`Brokerage ${money(s.fees)} · slippage ${money(s.slippage)}`}>{money(s.fees + s.slippage)}</td>
        <td className="pl-2 text-right">{s.trades ? `${s.targetFirst} / ${s.stopFirst} / ${s.timeExits}` : "—"}</td>
      </tr>
    );
  }

  const tr = backtest.periods.training.combined.stats, te = backtest.periods.testing.combined.stats;
  const compare: { label: string; a: string; b: string }[] = [
    { label: "Closed trades", a: String(tr.trades), b: String(te.trades) },
    { label: "Win rate", a: tr.winRate === null ? "—" : `${Math.round(tr.winRate)}%`, b: te.winRate === null ? "—" : `${Math.round(te.winRate)}%` },
    { label: "Average P&L per trade", a: smoney(tr.avgPnl), b: smoney(te.avgPnl) },
    { label: "Average R per trade", a: rr(tr.avgR), b: rr(te.avgR) },
    { label: "Profit factor", a: ratio(tr.profitFactor), b: ratio(te.profitFactor) },
    { label: "Maximum drawdown", a: `−${tr.maxDrawdownPct.toFixed(1)}%`, b: `−${te.maxDrawdownPct.toFixed(1)}%` },
    { label: "Account return", a: pct(tr.returnPct), b: pct(te.returnPct) },
    { label: `${ticker}'s own move`, a: pct(backtest.periods.training.stockChangePct), b: pct(backtest.periods.testing.stockChangePct) },
  ];

  return (
    <section className="mt-4 border border-[#E5E5E5] rounded-2xl p-4" aria-labelledby="backtest-title">
      <div className="flex items-baseline justify-between gap-x-3 gap-y-1 flex-wrap">
        <h2 id="backtest-title" className="text-[16px] font-bold text-[#0A0A0A]">Setup backtest</h2>
        <span className="text-[11px] text-[#A3A3A3]">{ticker} · {timeframeLabel} bars · {span("whole")} · {backtest.periods.whole.to + 1} bars</span>
      </div>
      <p className="mt-1 text-[13px] text-[#525252] max-w-3xl">
        Every setup detected on this chart, traded through a simulated account with brokerage, slippage and position sizing, using only
        the bars known at the time. It shows how these rules would have done on this stock in the past. Past results don&apos;t
        guarantee or predict future ones.
      </p>

      {/* ── Settings ── */}
      <div className="mt-3 rounded-xl bg-[#FAFAFA] border border-[#F0F0F0] px-3 py-2.5 text-[12px] text-[#0A0A0A]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <p className="text-[#525252] max-w-3xl">
            <b className="text-[#0A0A0A]">Entry</b> next bar&apos;s open · <b className="text-[#0A0A0A]">stop</b> the setup&apos;s invalidation level ·{" "}
            <b className="text-[#0A0A0A]">target</b> {cfg.targetR}R · <b className="text-[#0A0A0A]">exit</b> after {cfg.maxBars} bars ·{" "}
            <b className="text-[#0A0A0A]">brokerage</b> {money(cfg.feeFixed)} + {cfg.feePct}% per order · <b className="text-[#0A0A0A]">slippage</b> {cfg.slippagePct}% per fill ·{" "}
            <b className="text-[#0A0A0A]">risk</b> {cfg.riskPct}% of a {money(cfg.capital)} balance per trade ·{" "}
            {cfg.overlap ? "several positions at once" : "one position at a time"} · <b className="text-[#0A0A0A]">training</b> first {cfg.trainPct}% of the bars
          </p>
          <div className="flex items-center gap-3">
            {changed.length > 0 && (
              <button onClick={() => onConfigChange(DEFAULT_BACKTEST_CONFIG)} className="font-semibold text-[#2D8CFF] hover:underline">
                Reset ({changed.length} changed)
              </button>
            )}
            <button onClick={() => setEditing(!editing)} aria-expanded={editing} className="font-semibold text-[#2D8CFF] hover:underline">
              {editing ? "Done" : "Change settings"}
            </button>
          </div>
        </div>
        {editing && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BACKTEST_PARAMS.map((g) => (
              <fieldset key={g.title}>
                <legend className="text-[11px] font-semibold uppercase tracking-wide text-[#A3A3A3] mb-1.5">{g.title}</legend>
                <div className="space-y-2">
                  {g.params.map((def) => (
                    <div key={def.key}>
                      {def.kind === "boolean" ? (
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!cfg[def.key]} onChange={(e) => set(def.key, e.target.checked)} className="mt-0.5 accent-[#7C3AED]" />
                          <span>{def.label}</span>
                        </label>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="min-w-[110px]">{def.label}</span>
                          <NumberField def={def} value={cfg[def.key] as number} onCommit={(v) => set(def.key, v)} />
                          {def.unit && <span className="text-[#525252]">{def.unit}</span>}
                        </div>
                      )}
                      <p className="text-[11px] text-[#A3A3A3] mt-0.5">{def.help}</p>
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-[#525252]">
          Bull flags are traded once they close above the flag. Golden crosses have no invalidation level, so their stop is {cfg.fallbackStopRanges} average
          bar ranges below the entry.
          {rulesChanged > 0 && <> Uses your setup rules ({rulesChanged} changed from the defaults).</>}
          {latestForming && <> The latest bar is still forming and is left out until it closes.</>}
        </p>
      </div>

      {/* ── Training vs testing ── */}
      <h3 className="mt-4 text-[13px] font-bold text-[#0A0A0A]">Training vs testing <span className="font-normal text-[#525252]">(all setups together)</span></h3>
      <div className="relative mt-1 overflow-x-auto">
        <table className="text-[12px] tabular-nums text-[#0A0A0A]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[#A3A3A3]">
              <th scope="col" className="py-1 pr-6 text-left font-semibold"><span className="sr-only">Measure</span></th>
              <th scope="col" className="px-3 pb-1 text-right font-semibold align-bottom">
                Training<span className="sr-only"> · </span><span className="block normal-case font-normal tracking-normal">{span("training")}</span>
              </th>
              <th scope="col" className="pl-3 pb-1 text-right font-semibold align-bottom">
                Testing<span className="sr-only"> · </span><span className="block normal-case font-normal tracking-normal">{span("testing")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {compare.map((r) => (
              <tr key={r.label} className="border-t border-[#F0F0F0]">
                <th scope="row" className="py-1 pr-6 text-left font-medium">{r.label}</th>
                <td className="px-3 text-right">{r.a}</td>
                <td className="pl-3 text-right">{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[12px] text-[#525252] max-w-3xl">
        Judge and adjust the rules on the training period only, then look at testing: those bars played no part in your choices. Results
        that are much worse in testing suggest the rules fit the training period by chance.
        {(few(tr) || few(te)) && <> {few(te) ? "The testing period" : "The training period"} has fewer than {MIN_SAMPLE} closed trades, too few to tell skill from luck.</>}
      </p>

      {/* ── Results for one period ── */}
      <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-[13px] font-bold text-[#0A0A0A]">Results by setup</h3>
        <div className="flex rounded-full bg-[#F5F5F5] p-0.5" role="group" aria-label="Period">
          {(["whole", "training", "testing"] as PeriodId[]).map((id) => (
            <button
              key={id}
              onClick={() => { setPeriod(id); setLimit(PAGE); }}
              aria-pressed={period === id}
              title={span(id)}
              className={`px-3 py-1 text-[12px] font-semibold rounded-full ${period === id ? "bg-white text-[#0A0A0A] shadow-sm" : "text-[#525252] hover:text-[#0A0A0A]"}`}
            >
              {PERIOD_NAME[id]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-0.5 text-[11px] text-[#A3A3A3]">{span(period)}. Each setup is tested in its own {money(cfg.capital)} account; the last row trades them all through one. Choose a row to see its balance and trades.</p>
      <div className="relative mt-1 overflow-x-auto">
        <table className="w-full text-[12px] tabular-nums text-[#0A0A0A] whitespace-nowrap">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[#A3A3A3]">
              <Th left>Setup</Th>
              <Th title="Closed trades">Trades</Th>
              <Th title="Closed trades with a net profit">Win rate</Th>
              <Th>Avg win</Th>
              <Th>Avg loss</Th>
              <Th title="Average net profit or loss per closed trade, after costs">Avg P&amp;L</Th>
              <Th title="Average net result in units of the amount risked (expectancy)">Avg R</Th>
              <Th title="Average risk : reward planned at entry">Avg R:R</Th>
              <Th title="Average win ÷ average loss">Win ÷ loss</Th>
              <Th title="Gross profit ÷ gross loss, after costs">Profit factor</Th>
              <Th title="Largest fall in the balance from a peak, open positions included">Max drawdown</Th>
              <Th title="Change in the balance over the period">Return</Th>
              <Th title="Brokerage plus slippage">Costs</Th>
              <Th title="Exits at the target / stop / time limit">Target / stop / time</Th>
            </tr>
          </thead>
          <tbody>
            {SETUP_ORDER.map((k) => statsRow(k))}
            {statsRow("all")}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[12px] text-[#525252] max-w-3xl">
        Over the same bars {ticker} itself moved <b className={tone(p.stockChangePct)}>{pct(p.stockChangePct)}</b>. In a rising stock most long setups look
        good, so a positive result may say more about the stock than the setup.
      </p>

      <BalanceChart
        values={acc.balance}
        from={p.from}
        times={times}
        intraday={intraday}
        capital={cfg.capital}
        money={money}
        drawdown={acc.stats.drawdownFrom !== null && acc.stats.drawdownTo !== null ? { from: acc.stats.drawdownFrom, to: acc.stats.drawdownTo, pct: acc.stats.maxDrawdownPct } : null}
        splitAt={period === "whole" ? backtest.split : undefined}
        title={`Balance: ${accountName(account).toLowerCase()} · ${PERIOD_NAME[period].toLowerCase()}`}
      />

      {/* ── Trades ── */}
      <h3 className="mt-4 text-[13px] font-bold text-[#0A0A0A]">
        Trades: {accountName(account).toLowerCase()} <span className="font-normal text-[#525252]">({acc.trades.length})</span>
      </h3>
      {acc.skipped.length > 0 && (
        <p className="mt-0.5 text-[12px] text-[#525252]">
          {acc.skipped.length} more signal{acc.skipped.length === 1 ? " wasn't" : "s weren't"} traded:{" "}
          {Array.from(skipCounts, ([reason, c]) => `${c} because ${SKIP_TEXT[reason]}`).join("; ")}.
        </p>
      )}
      {list.length === 0 ? (
        <p className="mt-1 text-[13px] text-[#525252]">No trades in this period.</p>
      ) : (
        <div className="relative mt-1 overflow-x-auto">
          <table className="w-full text-[12px] tabular-nums text-[#0A0A0A] whitespace-nowrap">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[#A3A3A3]">
                <Th left>Detected</Th>
                <Th left>Setup</Th>
                <Th>Shares</Th>
                <Th title="Price paid, after slippage">Entry</Th>
                <Th>Stop</Th>
                <Th>Target</Th>
                <Th left>Result</Th>
                <Th title="Price received, after slippage">Exit</Th>
                <Th title="Brokerage plus slippage">Costs</Th>
                <Th title="After costs">Net P&amp;L</Th>
                <Th title="Net P&L ÷ amount paid">Return</Th>
                <Th title="Net P&L ÷ amount risked">R</Th>
                <Th title="Best price reached while in the trade">MFE</Th>
                <Th title="Worst price reached while in the trade">MAE</Th>
                <Th>Bars</Th>
                <th scope="col" className="pl-2"><span className="sr-only">Chart</span></th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((t) => {
                const isShown = !!shown && shown.period === period && shown.account === account && shown.type === t.type && shown.signal === t.signal;
                const res = RESULT[t.outcome];
                const note = t.sameBar ? "Stop and target in the same bar; counted as the stop"
                  : t.gap ? `Opened past the ${t.outcome}, so filled at the open`
                  : t.outcome === "open" ? "Still open at the end of the period: valued at the last close" : undefined;
                return (
                  <tr key={`${t.type}:${t.signal}`} className={`border-t border-[#F0F0F0] ${isShown ? "bg-[#F3EEFF]" : ""}`} data-trade={`${t.type}:${t.signal}`}>
                    <td className="py-1.5 pr-2">{when(t.signal)}</td>
                    <td className="px-2">
                      {SETUP_INFO[t.type].name}
                      {t.also.length > 0 && <span className="text-[#A3A3A3]" title="Also detected on the same bar; traded as one position"> + {t.also.map((a) => SETUP_INFO[a].short).join(", ")}</span>}
                    </td>
                    <td className="px-2 text-right">{t.shares.toLocaleString("en-US")}</td>
                    <td className="px-2 text-right" title={`Opened ${when(t.entryIndex)} at ${price(t.entryPrice)}`}>{price(t.entry)}</td>
                    <td className="px-2 text-right" title={t.stopBasis === "invalidation" ? t.check.invalidation.text : `${cfg.fallbackStopRanges} average bar ranges below the entry`}>{price(t.stop)}</td>
                    <td className="px-2 text-right">{price(t.target)}</td>
                    <td className="px-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${res.cls}`} title={note}>
                        {res.label}{t.gap ? " · gap" : t.sameBar ? " · same bar" : ""}
                      </span>
                    </td>
                    <td className="px-2 text-right" title={t.outcome === "open" ? "Last close" : `Sold ${when(t.exitIndex)}, triggered at ${price(t.exitPrice)}`}>{price(t.exit)}</td>
                    <td className="px-2 text-right" title={`Brokerage ${money(t.fees)} · slippage ${money(t.slippageCost)}`}>{money(t.fees + t.slippageCost)}</td>
                    <td className={`px-2 text-right ${tone(t.netPnl)}`}>{smoney(t.netPnl)}</td>
                    <td className={`px-2 text-right ${tone(t.netReturnPct)}`}>{pct(t.netReturnPct)}</td>
                    <td className={`px-2 text-right ${tone(t.netR)}`}>{rr(t.netR)}</td>
                    <td className="px-2 text-right" title={`${t.mfeR.toFixed(2)}R`}>{pct(t.mfePct)}</td>
                    <td className="px-2 text-right" title={`${t.maeR.toFixed(2)}R`}>{pct(-t.maePct)}</td>
                    <td className="px-2 text-right">{t.bars}</td>
                    <td className="pl-2 text-right">
                      <button
                        onClick={() => onShow(isShown ? null : { period, account, type: t.type, signal: t.signal })}
                        aria-pressed={isShown}
                        aria-label={`${isShown ? "Hide" : "Show"} the ${SETUP_INFO[t.type].name.toLowerCase()} from ${when(t.signal)} on the chart`}
                        className="text-[12px] font-semibold text-[#2D8CFF] hover:underline"
                      >
                        {isShown ? "Hide" : "Show"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.length > limit && (
        <button onClick={() => setLimit(limit + PAGE)} className="mt-2 text-[12px] font-semibold text-[#2D8CFF] hover:underline">
          Show {Math.min(PAGE, list.length - limit)} more ({list.length - limit} not shown)
        </button>
      )}

      <HowItWorks summary="How the backtest works">
        <p>
          <b>Signals.</b> A setup counts from the first bar it was detected on, judged with only that bar and the ones before it, exactly as
          the setups panel does. Bull flags count from the first bar that closes above the flag.
        </p>
        <p>
          <b>Entry, stop and target.</b> The trade buys at the open of the bar after the signal, the first price anyone could have traded at,
          plus slippage. The stop is the price that invalidates the setup by its own rules (the broken level, the pullback low, the flag low or
          the bounce low). The target is {cfg.targetR} times the risk above the price paid. If the next bar opens at or below the stop, the
          trade isn&apos;t taken.
        </p>
        <p>
          <b>Exit.</b> Each bar from the entry on is checked in turn: a low at or below the stop sells at the stop, a high at or above the
          target sells at the target, and after {cfg.maxBars} bars the trade sells at that bar&apos;s close, each less slippage. A bar that opens
          beyond the stop or target sells at its open, which can be worse than the stop. Within a bar the order of the high and low is
          unknown, so a bar that reaches both counts as the stop. Trades still running at the end of a period are listed as open, valued at
          the last close, and left out of the trade statistics.
        </p>
        <p>
          <b>Costs and sizing.</b> Every buy and sell pays {money(cfg.feeFixed)} plus {cfg.feePct}% brokerage, and fills {cfg.slippagePct}% worse
          than the price that triggered it. Each trade buys the whole number of shares whose loss at the stop would be {cfg.riskPct}% of the
          balance from closed trades, never more than the cash available. Costs can turn a trade with a small favourable move into a loss,
          especially on intraday charts where stops are close.
        </p>
        <p>
          <b>Several setups on one stock.</b> Each setup is first tested on its own, in its own account, one position at a time. In the
          combined account, setups detected on the same bar become one trade, led by the one with most confirmations met, and{" "}
          {cfg.overlap ? "a new signal opens another position if there's cash for it." : "a signal while a position is open is skipped."}
        </p>
        <p>
          <b>Measures.</b> Win rate counts closed trades with a net profit. Avg R is the expectancy: the average net result per trade in
          units of the amount risked, so −1R is a full stop-out. Avg R:R is the planned risk : reward at entry; win ÷ loss is what was
          achieved. Profit factor is gross profit ÷ gross loss. Maximum drawdown is the largest fall in the balance from a peak, valuing open
          positions at each close (intrabar lows aren&apos;t counted). MFE and MAE are the best and worst prices reached while in a trade.
        </p>
        <p>
          <b>Training and testing.</b> The first {cfg.trainPct}% of the bars are the training period and the rest the testing period. Each
          starts with a fresh balance; training trades can&apos;t use testing bars, and testing setups are still judged with the bars before
          them, as they would have been at the time. Changing setup rules or these settings after looking at testing results makes the
          testing period part of training.
        </p>
        <p>
          <b>Limits.</b> No dividends (prices are adjusted for splits only), taxes, borrowing, partial fills or market impact. Only the bars on
          this chart are used, so samples are small, especially on intraday charts (60 days of 5- and 15-minute bars). The stock still trades
          today, which flatters any test. Historical performance doesn&apos;t guarantee future results.
        </p>
      </HowItWorks>
    </section>
  );
}
