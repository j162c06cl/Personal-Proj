import { NextRequest, NextResponse } from "next/server";
import { UA, getYahooAuth, raw, resetYahooAuth } from "@/lib/server/yahoo";
import { forceSnapshot, snapshotFundamentals } from "@/lib/server/snapshot";

// Company fundamentals, analyst targets and upcoming events from Yahoo quoteSummary.
const MODULES = "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile,calendarEvents";

type Mod = Record<string, unknown>;

async function fetchSummary(ticker: string, retry = true): Promise<Record<string, Mod> | null> {
  const auth = await getYahooAuth();
  if (!auth) return null;
  const r = await fetch(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${MODULES}&crumb=${encodeURIComponent(auth.crumb)}`,
    { headers: { "User-Agent": UA, Cookie: auth.cookie, Accept: "application/json" }, cache: "no-store" }
  );
  if (r.status === 401 && retry) {
    resetYahooAuth();
    return fetchSummary(ticker, false);
  }
  if (!r.ok) return null;
  const j = await r.json();
  return j?.quoteSummary?.result?.[0] ?? null;
}

// Earnings timestamps are the US-Eastern announcement time (e.g. 4pm ET)
function usMarketDate(sec: number | undefined): string | null {
  return sec ? new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null;
}

// Dividend dates are stored as midnight UTC of the calendar day
function utcDate(sec: number | null): string | null {
  return sec ? new Date(sec * 1000).toISOString().slice(0, 10) : null;
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // Live data unavailable (or snapshot mode): fall back to the saved snapshot if this ticker has one
  const fallback = () => {
    const saved = snapshotFundamentals(ticker);
    return saved ? NextResponse.json(saved) : NextResponse.json({ error: "Fundamentals unavailable" }, { status: 502 });
  };
  if (forceSnapshot) return fallback();

  try {
    const s = await fetchSummary(ticker);
    if (!s) return fallback();

    const price = s.price ?? {};
    const sd = s.summaryDetail ?? {};
    const ks = s.defaultKeyStatistics ?? {};
    const fd = s.financialData ?? {};
    const ap = s.assetProfile ?? {};
    const cal = (s.calendarEvents ?? {}) as Mod;
    const earn = (cal.earnings ?? {}) as Mod;
    const earningsDates = ((earn.earningsDate as unknown[]) ?? []).map(raw).filter((n): n is number => n !== null);

    return NextResponse.json({
      ticker,
      name: String(price.longName ?? price.shortName ?? ticker),
      exchange: String(price.exchangeName ?? ""),
      quoteType: String(price.quoteType ?? ""),
      currency: String(price.currency ?? "USD"),
      profile: {
        sector: (ap.sectorDisp ?? ap.sector ?? null) as string | null,
        industry: (ap.industryDisp ?? ap.industry ?? null) as string | null,
        summary: (ap.longBusinessSummary ?? null) as string | null,
        website: (ap.website ?? null) as string | null,
        employees: (ap.fullTimeEmployees ?? null) as number | null,
        country: (ap.country ?? null) as string | null,
      },
      valuation: {
        marketCap: raw(sd.marketCap) ?? raw(price.marketCap),
        trailingPE: raw(sd.trailingPE),
        forwardPE: raw(sd.forwardPE) ?? raw(ks.forwardPE),
        priceToBook: raw(ks.priceToBook),
        priceToSales: raw(sd.priceToSalesTrailing12Months) ?? raw(ks.priceToSalesTrailing12Months),
        enterpriseValue: raw(ks.enterpriseValue),
        evToEbitda: raw(ks.enterpriseToEbitda),
      },
      profitability: {
        grossMargin: raw(fd.grossMargins),
        operatingMargin: raw(fd.operatingMargins),
        profitMargin: raw(fd.profitMargins),
        returnOnEquity: raw(fd.returnOnEquity),
        returnOnAssets: raw(fd.returnOnAssets),
      },
      growth: {
        revenueGrowth: raw(fd.revenueGrowth),
        earningsGrowth: raw(fd.earningsGrowth),
        earningsQuarterlyGrowth: raw(ks.earningsQuarterlyGrowth),
        totalRevenue: raw(fd.totalRevenue),
      },
      health: {
        totalCash: raw(fd.totalCash),
        totalDebt: raw(fd.totalDebt),
        debtToEquity: raw(fd.debtToEquity),
        currentRatio: raw(fd.currentRatio),
        freeCashflow: raw(fd.freeCashflow),
      },
      dividend: {
        yield: raw(sd.dividendYield) ?? raw(sd.yield), // ETFs report "yield" instead
        rate: raw(sd.dividendRate),
        payoutRatio: raw(sd.payoutRatio),
      },
      risk: {
        beta: raw(sd.beta) ?? raw(ks.beta),
        shortPercentOfFloat: raw(ks.shortPercentOfFloat),
        heldByInstitutions: raw(ks.heldPercentInstitutions),
        heldByInsiders: raw(ks.heldPercentInsiders),
      },
      analysts: {
        targetMean: raw(fd.targetMeanPrice),
        targetHigh: raw(fd.targetHighPrice),
        targetLow: raw(fd.targetLowPrice),
        recommendation: (fd.recommendationKey ?? null) as string | null,
        count: raw(fd.numberOfAnalystOpinions),
      },
      // Calendar dates (YYYY-MM-DD) so they don't shift a day in the viewer's timezone
      events: {
        earningsDate: usMarketDate(earningsDates[0]),
        earningsDateEnd: usMarketDate(earningsDates[1]),
        earningsIsEstimate: Boolean(earn.isEarningsDateEstimate),
        epsEstimate: raw(earn.earningsAverage),
        revenueEstimate: raw(earn.revenueAverage),
        exDividendDate: utcDate(raw(cal.exDividendDate)),
        dividendDate: utcDate(raw(cal.dividendDate)),
      },
      source: "Yahoo Finance",
      asOf: new Date().toISOString(),
    });
  } catch {
    return fallback();
  }
}
