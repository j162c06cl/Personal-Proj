// Turns a stock's data into two separate verdicts (long-term and swing) and a research
// summary. Every check and every point names the data it came from and its date, so
// nothing is an opaque score: a verdict is just the list of checks and how many passed.

import type { FinancialHistory, FinancialYear, Fundamentals, NewsFeed, PricePoint, Sourced } from "./types";
import type { Technicals } from "./indicators";
import { formatBig, formatMoney } from "./markets";

export type CheckStatus = "pass" | "fail" | "unknown";

export interface SourceRef {
  label: string;
  /** ISO date or timestamp the data is as of */
  date: string | null;
  url?: string;
}

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  source: SourceRef;
}

export interface Verdict {
  strategy: "long-term" | "swing";
  checks: Check[];
  met: number;
  /** Checks that could be judged (unknowns excluded) */
  judged: number;
  summary: string;
}

export interface ResearchPoint {
  text: string;
  source: SourceRef;
}

export interface ResearchSummary {
  strengths: ResearchPoint[];
  weaknesses: ResearchPoint[];
  catalysts: ResearchPoint[];
  risks: ResearchPoint[];
}

export interface AnalysisInput {
  price: number | null;
  currency: string;
  fund: Sourced<Fundamentals> | null;
  fin: Sourced<FinancialHistory> | null;
  tech: Technicals | null;
  /** Where the technicals came from, e.g. "Calculated from Yahoo Finance daily prices" */
  techSource: SourceRef | null;
  /** Weekly or daily closes reaching back over the reported fiscal years, for historical P/E */
  longPrices?: PricePoint[];
  news?: Sourced<NewsFeed> | null;
  /** The investor's base currency; a different listing currency is a risk worth naming */
  baseCurrency?: string;
  today?: Date;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const has = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const fy = (y: FinancialYear) => `FY${y.date.slice(0, 4)}`;

function daysBetween(fromIso: string, today: Date) {
  const d = new Date(fromIso.length === 10 ? `${fromIso}T00:00:00` : fromIso);
  d.setHours(0, 0, 0, 0);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

const fundRef = (f: Sourced<Fundamentals>): SourceRef => ({ label: `${f.source} key statistics`, date: f.asOf });
const finRef = (h: Sourced<FinancialHistory>, y?: FinancialYear): SourceRef => ({
  label: y ? `${fy(y)} annual report via ${h.source.replace(/ \(annual reports\)$/, "")}` : `Annual reports via ${h.source.replace(/ \(annual reports\)$/, "")}`,
  date: y?.date ?? h.value.years.at(-1)?.date ?? h.asOf,
});

const isFinancial = (f: Fundamentals | undefined) => /financial/i.test(f?.profile.sector ?? "");

/** Compound annual growth between the first and last value; null if either isn't positive */
export function cagr(first: number, last: number, years: number): number | null {
  if (first <= 0 || last <= 0 || years <= 0) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

/** Year-end P/E for each fiscal year: closing price at year end ÷ diluted EPS */
export function historicalPE(years: FinancialYear[], prices: PricePoint[]): { date: string; pe: number }[] {
  const out: { date: string; pe: number }[] = [];
  for (const y of years) {
    if (!has(y.dilutedEps) || y.dilutedEps <= 0) continue;
    let close: number | null = null;
    for (const p of prices) { if (p.t <= y.date) close = p.c; else break; }
    if (close !== null && prices[0] && prices[0].t <= y.date) out.push({ date: y.date, pe: close / y.dilutedEps });
  }
  return out;
}

function verdict(strategy: Verdict["strategy"], checks: Check[]): Verdict {
  const judged = checks.filter((c) => c.status !== "unknown");
  const met = judged.filter((c) => c.status === "pass").length;
  const name = strategy === "long-term" ? "long-term" : "swing";
  let summary: string;
  if (!judged.length) summary = `Not enough data to judge it as a ${name} ${strategy === "long-term" ? "investment" : "trade"} yet.`;
  else {
    // Lower-case the first letter only, so acronyms like MACD survive
    const failed = judged.filter((c) => c.status === "fail").map((c) => (/^[A-Z][a-z]/.test(c.label) ? c.label[0].toLowerCase() + c.label.slice(1) : c.label));
    summary = `Meets ${met} of ${judged.length} ${name} checks.`;
    if (failed.length) summary += ` Falls short on: ${failed.join(", ")}.`;
    else summary += " Every check that could be judged passed.";
    const unknown = checks.length - judged.length;
    if (unknown) summary += ` ${unknown} couldn't be judged from the available data.`;
  }
  return { strategy, checks, met, judged: judged.length, summary };
}

// ── Long-term ───────────────────────────────────────────────────────────────

export function longTermVerdict(input: AnalysisInput): Verdict {
  const { fund, fin, tech, techSource, price, currency } = input;
  const f = fund?.value;
  const years = fin?.value.years ?? [];
  const ccy = fin?.value.currency ?? currency;
  const checks: Check[] = [];
  const unknown = (id: string, label: string, detail: string, source: SourceRef = { label: "No data", date: null }) =>
    checks.push({ id, label, status: "unknown", detail, source });

  // 1. Revenue growth over the reported years
  const rev = years.filter((y) => has(y.revenue));
  if (fin && rev.length >= 2) {
    const a = rev[0], b = rev[rev.length - 1];
    const g = cagr(a.revenue!, b.revenue!, rev.length - 1);
    checks.push({
      id: "revenue-growth",
      label: "Growing revenue",
      status: g !== null && g >= 0.05 ? "pass" : "fail",
      detail: `Revenue went from ${formatBig(a.revenue, ccy)} (${fy(a)}) to ${formatBig(b.revenue, ccy)} (${fy(b)})${g !== null ? `, ${pct(g)} a year` : ""}. Looks for 5%+ a year.`,
      source: finRef(fin, b),
    });
  } else if (f && has(f.growth.revenueGrowth) && fund) {
    checks.push({
      id: "revenue-growth",
      label: "Growing revenue",
      status: f.growth.revenueGrowth >= 0.05 ? "pass" : "fail",
      detail: `Revenue ${f.growth.revenueGrowth >= 0 ? "up" : "down"} ${pct(Math.abs(f.growth.revenueGrowth))} year over year (latest quarter). Looks for 5%+.`,
      source: fundRef(fund),
    });
  } else unknown("revenue-growth", "Growing revenue", "No revenue history available.");

  // 2. Consistently profitable
  const ni = years.filter((y) => has(y.netIncome));
  if (fin && ni.length) {
    const losses = ni.filter((y) => y.netIncome! <= 0);
    checks.push({
      id: "profitable",
      label: "Consistently profitable",
      status: losses.length ? "fail" : "pass",
      detail: losses.length
        ? `Lost money in ${losses.map(fy).join(", ")}.`
        : `Net profit in each of the last ${ni.length} fiscal years (latest ${formatBig(ni[ni.length - 1].netIncome, ccy)}).`,
      source: finRef(fin, ni[ni.length - 1]),
    });
  } else unknown("profitable", "Consistently profitable", "No earnings history available.");

  // 3. Margins
  if (f && fund && (has(f.profitability.operatingMargin) || has(f.profitability.profitMargin))) {
    const useOp = has(f.profitability.operatingMargin) && !isFinancial(f);
    const m = useOp ? f.profitability.operatingMargin! : f.profitability.profitMargin!;
    const bar = useOp ? 0.15 : 0.1;
    checks.push({
      id: "margins",
      label: "Healthy margins",
      status: m >= bar ? "pass" : "fail",
      detail: `${useOp ? "Operating" : "Net"} margin ${pct(m)}. Looks for ${pct(bar, 0)}+.`,
      source: fundRef(fund),
    });
  } else unknown("margins", "Healthy margins", "Margins not reported.");

  // 4. Free cash flow (not meaningful for banks and insurers, whose cash flows are their deposits)
  const fcf = years.filter((y) => has(y.freeCashFlow));
  if (isFinancial(f)) unknown("fcf", "Positive free cash flow", "Not meaningful for banks and insurers: their cash flow reflects deposits and lending.", fin ? finRef(fin) : undefined);
  else if (fin && fcf.length) {
    const neg = fcf.filter((y) => y.freeCashFlow! <= 0);
    checks.push({
      id: "fcf",
      label: "Positive free cash flow",
      status: neg.length ? "fail" : "pass",
      detail: neg.length
        ? `Burned cash in ${neg.map(fy).join(", ")}.`
        : `Generated free cash every year; latest ${formatBig(fcf[fcf.length - 1].freeCashFlow, ccy)} (${fy(fcf[fcf.length - 1])}).`,
      source: finRef(fin, fcf[fcf.length - 1]),
    });
  } else unknown("fcf", "Positive free cash flow", "No cash flow history available.");

  // 5. Balance sheet
  if (isFinancial(f)) unknown("debt", "Manageable debt", "Debt ratios aren't comparable for banks and insurers; check capital ratios in the annual report.", fund ? fundRef(fund) : undefined);
  else if (f && fund && (has(f.health.debtToEquity) || (has(f.health.totalCash) && has(f.health.totalDebt)))) {
    const netCash = has(f.health.totalCash) && has(f.health.totalDebt) ? f.health.totalCash - f.health.totalDebt : null;
    const de = has(f.health.debtToEquity) ? f.health.debtToEquity / 100 : null; // Yahoo reports a percentage
    const ok = (netCash !== null && netCash > 0) || (de !== null && de < 1);
    checks.push({
      id: "debt",
      label: "Manageable debt",
      status: ok ? "pass" : "fail",
      detail: [
        de !== null ? `Debt/equity ${de.toFixed(2)}×` : null,
        netCash !== null ? `${netCash >= 0 ? "net cash" : "net debt"} ${formatBig(Math.abs(netCash), currency)}` : null,
      ].filter(Boolean).join(", ") + ". Looks for net cash or debt/equity under 1×.",
      source: fundRef(fund),
    });
  } else unknown("debt", "Manageable debt", "No balance sheet data.");

  // 6. Return on equity
  if (f && fund && has(f.profitability.returnOnEquity)) {
    checks.push({
      id: "roe",
      label: "High return on equity",
      status: f.profitability.returnOnEquity >= 0.15 ? "pass" : "fail",
      detail: `Return on equity ${pct(f.profitability.returnOnEquity)}. Looks for 15%+.`,
      source: fundRef(fund),
    });
  } else unknown("roe", "High return on equity", "Return on equity not reported.");

  // 7. Valuation against its own history (or an absolute bar without history)
  const pe = f?.valuation.trailingPE ?? null;
  const hist = fin && input.longPrices?.length ? historicalPE(fin.value.years, input.longPrices) : [];
  if (has(pe) && pe > 0 && fund) {
    if (hist.length >= 2) {
      const avg = hist.reduce((s, h) => s + h.pe, 0) / hist.length;
      checks.push({
        id: "valuation",
        label: "Reasonable valuation",
        status: pe <= avg * 1.1 ? "pass" : "fail",
        detail: `P/E ${pe.toFixed(1)} vs ${avg.toFixed(1)} average at the last ${hist.length} fiscal year-ends. Looks for no more than 10% above its own average.`,
        source: { label: `${fund.source} P/E; history from annual EPS and year-end prices`, date: fund.asOf },
      });
    } else {
      checks.push({
        id: "valuation",
        label: "Reasonable valuation",
        status: pe <= 25 ? "pass" : "fail",
        detail: `P/E ${pe.toFixed(1)}. Without enough history to compare, looks for 25 or below.`,
        source: fundRef(fund),
      });
    }
  } else if (has(pe) && pe <= 0) {
    checks.push({ id: "valuation", label: "Reasonable valuation", status: "fail", detail: "Negative earnings, so there is no meaningful P/E.", source: fundRef(fund!) });
  } else unknown("valuation", "Reasonable valuation", "No P/E available.");

  // 8. Long-term trend
  if (tech && techSource && has(tech.sma200) && has(price)) {
    checks.push({
      id: "trend",
      label: "Long-term trend intact",
      status: price > tech.sma200 ? "pass" : "fail",
      detail: `Price ${formatMoney(price, currency)} is ${price > tech.sma200 ? "above" : "below"} its 200-day average of ${formatMoney(tech.sma200, currency)}.`,
      source: techSource,
    });
  } else unknown("trend", "Long-term trend intact", "Less than 200 days of price history.");

  // 9. Dividend sustainability, only for payers
  if (f && fund && has(f.dividend.yield) && f.dividend.yield > 0 && has(f.dividend.payoutRatio)) {
    checks.push({
      id: "dividend",
      label: "Sustainable dividend",
      status: f.dividend.payoutRatio <= 0.8 ? "pass" : "fail",
      detail: `Yields ${pct(f.dividend.yield, 2)}, paying out ${pct(f.dividend.payoutRatio, 0)} of earnings. Looks for 80% or less.`,
      source: fundRef(fund),
    });
  }

  return verdict("long-term", checks);
}

// ── Swing ───────────────────────────────────────────────────────────────────

export function swingVerdict(input: AnalysisInput): Verdict {
  const { tech, techSource, fund, price, currency } = input;
  const today = input.today ?? new Date();
  const checks: Check[] = [];
  const src = techSource ?? { label: "No price history", date: null };
  const unknown = (id: string, label: string, detail: string) => checks.push({ id, label, status: "unknown", detail, source: src });

  if (!tech || !has(price)) {
    ["Uptrend", "Momentum not stretched", "Volume confirmation", "Entry near a level", "Defined risk", "Tradeable volatility", "MACD momentum"].forEach((l, i) =>
      unknown(`swing-${i}`, l, "Not enough price history.")
    );
  } else {
    // 1. Trend
    checks.push({
      id: "trend",
      label: "Uptrend",
      status: tech.trend === "Uptrend" ? "pass" : "fail",
      detail: tech.trend === "Uptrend"
        ? "Price above its 50-day average, which is above the 200-day."
        : tech.trend === "Downtrend" ? "Price below its 50-day average, which is below the 200-day." : "Moving averages don't agree on a direction.",
      source: src,
    });

    // 2. RSI in the zone with momentum but not overbought
    if (has(tech.rsi14)) {
      const r = tech.rsi14;
      checks.push({
        id: "rsi",
        label: "Momentum not stretched",
        status: r >= 40 && r <= 70 ? "pass" : "fail",
        detail: `RSI(14) ${r.toFixed(1)}${r > 70 ? ": overbought, chasing risks a pullback" : r < 40 ? ": weak momentum" : ""}. Looks for 40–70.`,
        source: src,
      });
    } else unknown("rsi", "Momentum not stretched", "RSI needs more history.");

    // 3. Volume
    if (has(tech.volumeRatio)) {
      checks.push({
        id: "volume",
        label: "Volume confirmation",
        status: tech.volumeRatio >= 1.2 ? "pass" : "fail",
        detail: `Latest volume ${tech.volumeRatio.toFixed(2)}× its 50-day average. Looks for 1.2× or more.`,
        source: src,
      });
    } else unknown("volume", "Volume confirmation", "No volume data.");

    // 4. Entry near a level: pullback to the 50-day or breakout near the 52-week high
    const toSma50 = has(tech.sma50) ? ((price - tech.sma50) / tech.sma50) * 100 : null;
    const fromHigh = tech.pctFromHigh52;
    const nearSupport = toSma50 !== null && Math.abs(toSma50) <= 3;
    const nearHigh = has(fromHigh) && fromHigh >= -3;
    checks.push({
      id: "level",
      label: "Entry near a level",
      status: nearSupport || nearHigh ? "pass" : "fail",
      detail: nearHigh
        ? `Within ${Math.abs(fromHigh!).toFixed(1)}% of its 52-week high (breakout zone).`
        : nearSupport
          ? `${Math.abs(toSma50!).toFixed(1)}% ${toSma50! >= 0 ? "above" : "below"} its 50-day average (pullback to support).`
          : `${toSma50 !== null ? `${Math.abs(toSma50).toFixed(1)}% from its 50-day average and ` : ""}${has(fromHigh) ? `${Math.abs(fromHigh).toFixed(1)}% below its 52-week high` : ""}. Looks for within 3% of either.`,
      source: src,
    });

    // 5. Defined risk: a stop under the 50-day average shouldn't be far away
    if (has(tech.sma50) && price > tech.sma50) {
      const risk = ((price - tech.sma50 * 0.98) / price) * 100;
      checks.push({
        id: "risk",
        label: "Defined risk",
        status: risk <= 8 ? "pass" : "fail",
        detail: `A stop 2% under the 50-day average (${formatMoney(tech.sma50 * 0.98, currency)}) risks ${risk.toFixed(1)}%. Looks for 8% or less.`,
        source: src,
      });
    } else if (has(tech.sma50)) {
      checks.push({ id: "risk", label: "Defined risk", status: "fail", detail: "Price is below its 50-day average, so there's no nearby support to place a stop under.", source: src });
    } else unknown("risk", "Defined risk", "Needs 50 days of history.");

    // 6. Volatility suited to swings
    if (has(tech.atrPct)) {
      const a = tech.atrPct;
      checks.push({
        id: "atr",
        label: "Tradeable volatility",
        status: a >= 1 && a <= 6 ? "pass" : "fail",
        detail: `Typical daily range (ATR) ${a.toFixed(1)}% of price${a < 1 ? ": too quiet to swing" : a > 6 ? ": very volatile, stops get hit" : ""}. Looks for 1–6%.`,
        source: src,
      });
    } else unknown("atr", "Tradeable volatility", "No range data.");

    // 7. MACD
    if (has(tech.macd) && has(tech.macdSignal)) {
      // The most recent cross wins; without one, the line's side of the signal decides
      const bull = tech.macdCross ? tech.macdCross.dir === "bullish" : tech.macd > tech.macdSignal;
      checks.push({
        id: "macd",
        label: "MACD momentum",
        status: bull ? "pass" : "fail",
        detail: tech.macdCross
          ? `${tech.macdCross.dir === "bullish" ? "Bullish" : "Bearish"} MACD cross ${tech.macdCross.barsAgo === 0 ? "today" : `${tech.macdCross.barsAgo} days ago`}.`
          : `MACD ${tech.macd > tech.macdSignal ? "above" : "below"} its signal line.`,
        source: src,
      });
    } else unknown("macd", "MACD momentum", "MACD needs more history.");
  }

  // 8. Earnings gap risk
  const earn = fund?.value.events.earningsDate ?? null;
  if (fund && earn) {
    const d = daysBetween(earn, today);
    if (d >= 0) {
      checks.push({
        id: "earnings",
        label: "No earnings inside the trade",
        status: d > 14 ? "pass" : "fail",
        detail: d > 14
          ? `Next earnings ${earn} (${d} days away), outside a typical 2-week swing.`
          : `Earnings ${d === 0 ? "today" : `in ${d} days`} (${earn}${fund.value.events.earningsIsEstimate ? ", estimated" : ""}): the price can gap past any stop.`,
        source: { label: `${fund.source} earnings calendar`, date: fund.asOf },
      });
    } else checks.push({ id: "earnings", label: "No earnings inside the trade", status: "pass", detail: `Last reported ${earn}; next date not announced yet.`, source: { label: `${fund.source} earnings calendar`, date: fund.asOf } });
  } else checks.push({ id: "earnings", label: "No earnings inside the trade", status: "unknown", detail: "No earnings date available.", source: { label: "No data", date: null } });

  return verdict("swing", checks);
}

// ── Research summary ────────────────────────────────────────────────────────

const POSITIVE_NEWS = /\b(beats?|record|raises? (guidance|outlook|forecast|dividend)|upgrade[sd]?|approv(al|es|ed)|wins?|contract|partnership|launch(es|ed)?|buyback|repurchase|expan(ds|sion)|acquir(es|ed)|surges?|jumps?)\b/i;
const NEGATIVE_NEWS = /\b(miss(es|ed)?|cuts? (guidance|outlook|forecast|dividend|jobs)|downgrade[sd]?|lawsuit|sued|probe|investigation|recall|fine[sd]?|layoffs?|plunges?|tumbles?|slumps?|warns?|delay(s|ed)?|antitrust|default|halt(s|ed)?|short seller)\b/i;

/** How a failed long-term check reads as a weakness */
const WEAKNESS_LABEL: Record<string, string> = {
  "revenue-growth": "Slow or shrinking revenue",
  profitable: "Not consistently profitable",
  margins: "Thin margins",
  fcf: "Negative free cash flow",
  debt: "Heavy debt",
  roe: "Low return on equity",
  valuation: "Expensive",
  trend: "Below its long-term trend",
  dividend: "Stretched dividend",
};

export function researchSummary(input: AnalysisInput, long: Verdict, swing: Verdict): ResearchSummary {
  const { fund, fin, tech, techSource, price, currency, news } = input;
  const f = fund?.value;
  const today = input.today ?? new Date();
  const out: ResearchSummary = { strengths: [], weaknesses: [], catalysts: [], risks: [] };

  // Strengths and weaknesses come straight from the long-term checks, so they can't disagree
  for (const c of long.checks) {
    if (c.status === "pass") out.strengths.push({ text: `${c.label}: ${c.detail.replace(/ Looks for.*$/, "")}`, source: c.source });
    if (c.status === "fail") out.weaknesses.push({ text: `${WEAKNESS_LABEL[c.id] ?? c.label}: ${c.detail.replace(/ Looks for.*$/, "")}`, source: c.source });
  }

  // Margin direction across the reported years
  const years = fin?.value.years ?? [];
  const withMargin = years.filter((y) => has(y.revenue) && has(y.netIncome) && y.revenue! > 0);
  if (fin && withMargin.length >= 3) {
    const first = withMargin[0], last = withMargin[withMargin.length - 1];
    const m0 = first.netIncome! / first.revenue!, m1 = last.netIncome! / last.revenue!;
    const point = { text: `Net margin ${m1 > m0 ? "widened" : "narrowed"} from ${pct(m0)} (${fy(first)}) to ${pct(m1)} (${fy(last)})`, source: finRef(fin, last) };
    if (Math.abs(m1 - m0) >= 0.02) (m1 > m0 ? out.strengths : out.weaknesses).push(point);
  }

  if (tech && techSource && has(tech.returns.y1)) {
    const y1 = tech.returns.y1;
    if (y1 >= 20) out.strengths.push({ text: `Up ${y1.toFixed(1)}% over the past year`, source: techSource });
    if (y1 <= -20) out.weaknesses.push({ text: `Down ${Math.abs(y1).toFixed(1)}% over the past year`, source: techSource });
  }

  // Catalysts: scheduled events, analyst expectations, and positive headlines
  if (f && fund) {
    const fref = { label: `${fund.source} calendar`, date: fund.asOf };
    if (f.events.earningsDate) {
      const d = daysBetween(f.events.earningsDate, today);
      if (d >= 0) out.catalysts.push({
        text: `Earnings report ${d === 0 ? "today" : `in ${d} days`} (${f.events.earningsDate}${f.events.earningsIsEstimate ? ", estimated" : ""})${has(f.events.epsEstimate) ? `; analysts expect EPS of ${formatMoney(f.events.epsEstimate, currency)}` : ""}`,
        source: fref,
      });
    }
    if (f.events.exDividendDate && daysBetween(f.events.exDividendDate, today) >= 0) {
      out.catalysts.push({ text: `Ex-dividend date ${f.events.exDividendDate}`, source: fref });
    }
    if (has(f.analysts.targetMean) && has(price) && has(f.analysts.count) && f.analysts.count >= 3) {
      const up = (f.analysts.targetMean - price) / price;
      const point = { text: `${f.analysts.count} analysts' mean target ${formatMoney(f.analysts.targetMean, currency)} is ${pct(Math.abs(up))} ${up >= 0 ? "above" : "below"} the price`, source: { label: `${fund.source} analyst estimates`, date: fund.asOf } };
      if (up >= 0.1) out.catalysts.push(point);
      if (up <= -0.05) out.risks.push(point);
    }
  }

  if (news) {
    for (const item of news.value.items.filter((n) => n.relevance !== "broad").slice(0, 25)) {
      const ref: SourceRef = { label: item.publisher, date: item.publishedAt, url: item.link };
      if (NEGATIVE_NEWS.test(item.title)) out.risks.push({ text: `In the news: “${item.title}”`, source: ref });
      else if (POSITIVE_NEWS.test(item.title)) out.catalysts.push({ text: `In the news: “${item.title}”`, source: ref });
    }
  }

  // Risks: event risk, positioning, volatility, balance sheet, currency
  const earningsCheck = swing.checks.find((c) => c.id === "earnings");
  if (earningsCheck?.status === "fail") out.risks.push({ text: earningsCheck.detail, source: earningsCheck.source });
  if (f && fund) {
    const sref = fundRef(fund);
    if (has(f.risk.shortPercentOfFloat) && f.risk.shortPercentOfFloat >= 0.1) out.risks.push({ text: `${pct(f.risk.shortPercentOfFloat)} of shares available to trade are sold short: many investors are betting on a fall`, source: sref });
    if (has(f.risk.beta) && f.risk.beta >= 1.5) out.risks.push({ text: `Beta ${f.risk.beta.toFixed(2)}: has moved about ${f.risk.beta.toFixed(1)}× as much as the market`, source: sref });
    if (has(f.dividend.payoutRatio) && f.dividend.payoutRatio > 1) out.risks.push({ text: `Pays out ${pct(f.dividend.payoutRatio, 0)} of earnings as dividends, more than it earns`, source: sref });
    if (has(f.health.currentRatio) && f.health.currentRatio < 1 && !isFinancial(f)) out.risks.push({ text: `Current ratio ${f.health.currentRatio.toFixed(2)}: short-term bills exceed short-term assets`, source: sref });
  }
  if (tech && techSource) {
    if (has(tech.volatility1y) && tech.volatility1y >= 45) out.risks.push({ text: `Annualised volatility ${tech.volatility1y.toFixed(0)}% over the past year, well above a typical large stock (~25%)`, source: techSource });
    if (has(tech.maxDrawdown1y) && tech.maxDrawdown1y <= -30) out.risks.push({ text: `Fell ${Math.abs(tech.maxDrawdown1y).toFixed(0)}% from peak to trough within the past year`, source: techSource });
  }
  if (input.baseCurrency && currency && input.baseCurrency !== currency) {
    out.risks.push({ text: `Trades in ${currency}; your returns in ${input.baseCurrency} also move with the exchange rate`, source: { label: fund ? `Listing currency from ${fund.source}` : "Listing currency", date: fund?.asOf ?? null } });
  }

  return out;
}
