import { NextRequest, NextResponse } from "next/server";
import { UA } from "@/lib/server/yahoo";
import { readTicker } from "@/lib/apiLimits";
import type { FinancialYear } from "@/lib/types";

// Reported annual financials (income statement, cash flow, balance sheet) from Yahoo's
// fundamentals time series. Yahoo keeps roughly the last four fiscal years.
const FIELDS: Record<string, keyof Omit<FinancialYear, "date">> = {
  annualTotalRevenue: "revenue",
  annualGrossProfit: "grossProfit",
  annualOperatingIncome: "operatingIncome",
  annualNetIncome: "netIncome",
  annualDilutedEPS: "dilutedEps",
  annualOperatingCashFlow: "operatingCashFlow",
  annualCapitalExpenditure: "capex",
  annualFreeCashFlow: "freeCashFlow",
  annualTotalDebt: "totalDebt",
  annualCashAndCashEquivalents: "cash",
  annualStockholdersEquity: "equity",
  annualOrdinarySharesNumber: "sharesOutstanding",
};

const EMPTY: Omit<FinancialYear, "date"> = {
  revenue: null, grossProfit: null, operatingIncome: null, netIncome: null, dilutedEps: null,
  operatingCashFlow: null, capex: null, freeCashFlow: null, totalDebt: null, cash: null, equity: null, sharesOutstanding: null,
};

interface Point { asOfDate: string; currencyCode?: string; reportedValue?: { raw?: number } }

export async function GET(request: NextRequest) {
  const ticker = readTicker(request.nextUrl.searchParams.get("ticker"));
  if (!ticker) return NextResponse.json({ error: "A valid ticker is required" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  const from = now - 8 * 365 * 86_400;
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}`
    + `?type=${Object.keys(FIELDS).join(",")}&period1=${from}&period2=${now}`;

  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: `Financials provider returned ${r.status}` }, { status: 502 });
    const j = await r.json();
    const series: Record<string, unknown>[] = j?.timeseries?.result ?? [];

    const byDate = new Map<string, FinancialYear>();
    let currency: string | null = null;
    for (const s of series) {
      const type = ((s.meta as { type?: string[] })?.type ?? [])[0];
      const field = type ? FIELDS[type] : undefined;
      if (!field) continue;
      for (const p of ((s[type!] as (Point | null)[]) ?? [])) {
        const v = p?.reportedValue?.raw;
        if (!p?.asOfDate || typeof v !== "number") continue;
        currency ??= p.currencyCode ?? null;
        const row = byDate.get(p.asOfDate) ?? { date: p.asOfDate, ...EMPTY };
        row[field] = v;
        byDate.set(p.asOfDate, row);
      }
    }

    const years = Array.from(byDate.values())
      .map((y) => ({
        ...y,
        // Some filers don't report free cash flow directly; it is operating cash flow less capex
        freeCashFlow: y.freeCashFlow ?? (y.operatingCashFlow !== null && y.capex !== null ? y.operatingCashFlow + y.capex : null),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!years.length) return NextResponse.json({ error: "No reported financials for this symbol" }, { status: 404 });
    return NextResponse.json({ ticker, currency, years, source: "Yahoo Finance (annual reports)", asOf: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Financials unavailable" }, { status: 502 });
  }
}
