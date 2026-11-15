import { describe, expect, it } from "vitest";
import { AnalysisInput, cagr, historicalPE, longTermVerdict, researchSummary, swingVerdict } from "./analysis";
import type { Technicals } from "./indicators";
import type { FinancialYear, Fundamentals, NewsFeed, Sourced } from "./types";

const sourced = <T>(value: T, source = "Yahoo Finance"): Sourced<T> => ({ value, source, asOf: "2026-10-16T20:00:00.000Z", cached: false });

const year = (date: string, over: Partial<FinancialYear> = {}): FinancialYear => ({
  date, revenue: null, grossProfit: null, operatingIncome: null, netIncome: null, dilutedEps: null,
  operatingCashFlow: null, capex: null, freeCashFlow: null, totalDebt: null, cash: null, equity: null, sharesOutstanding: null, ...over,
});

function fundamentals(over: Partial<Fundamentals> = {}): Fundamentals {
  return {
    ticker: "X", name: "X Corp", exchange: "NasdaqGS", quoteType: "EQUITY", currency: "USD",
    profile: { sector: "Technology", industry: "Software", summary: null, website: null, employees: null, country: null },
    valuation: { marketCap: 50e9, trailingPE: 20, forwardPE: 18, priceToBook: 5, priceToSales: 4, enterpriseValue: null, evToEbitda: null },
    profitability: { grossMargin: 0.6, operatingMargin: 0.25, profitMargin: 0.2, returnOnEquity: 0.22, returnOnAssets: 0.1 },
    growth: { revenueGrowth: 0.1, earningsGrowth: 0.12, earningsQuarterlyGrowth: 0.1, totalRevenue: 10e9 },
    health: { totalCash: 5e9, totalDebt: 2e9, debtToEquity: 40, currentRatio: 1.5, freeCashflow: 2e9 },
    dividend: { yield: null, rate: null, payoutRatio: null },
    risk: { beta: 1.1, shortPercentOfFloat: 0.02, heldByInstitutions: 0.7, heldByInsiders: 0.01 },
    analysts: { targetMean: 120, targetHigh: 150, targetLow: 90, recommendation: "buy", count: 20 },
    events: { earningsDate: "2026-11-20", earningsDateEnd: null, earningsIsEstimate: false, epsEstimate: 1.2, revenueEstimate: null, exDividendDate: null, dividendDate: null },
    ...over,
  };
}

function technicals(over: Partial<Technicals> = {}): Technicals {
  return {
    last: 100, sma20: 99, sma50: 97, sma200: 85, ema20: 99, ema50: 96, rsi14: 58, macd: 1.2, macdSignal: 0.8, macdCross: null,
    volumeRatio: 1.4, high52: 103, low52: 70, pctFromHigh52: -2.9, atrPct: 2.1, low52Pct: 42.9, support3m: 90, resistance3m: 103,
    returns: { m1: 4, m3: 9, m6: 15, ytd: 18, y1: 30 }, volatility30: 22, volatility1y: 28, maxDrawdown1y: -12,
    trend: "Uptrend", bars: 500, ...over,
  };
}

const growing = [
  year("2022-12-31", { revenue: 7e9, netIncome: 1.2e9, freeCashFlow: 1.1e9, dilutedEps: 3 }),
  year("2023-12-31", { revenue: 8e9, netIncome: 1.5e9, freeCashFlow: 1.4e9, dilutedEps: 3.8 }),
  year("2024-12-31", { revenue: 9e9, netIncome: 1.8e9, freeCashFlow: 1.7e9, dilutedEps: 4.5 }),
  year("2025-12-31", { revenue: 10e9, netIncome: 2e9, freeCashFlow: 2e9, dilutedEps: 5 }),
];

const input = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({
  price: 100,
  currency: "USD",
  fund: sourced(fundamentals()),
  fin: sourced({ ticker: "X", currency: "USD", years: growing }, "Yahoo Finance (annual reports)"),
  tech: technicals(),
  techSource: { label: "Calculated from Yahoo Finance daily prices", date: "2026-10-16" },
  today: new Date("2026-10-17T12:00:00"),
  ...over,
});

const status = (v: { checks: { id: string; status: string }[] }, id: string) => v.checks.find((c) => c.id === id)?.status;

describe("cagr and historical P/E", () => {
  it("annualises growth between two values", () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(0.1, 10);
    expect(cagr(-5, 10, 2)).toBeNull();
  });

  it("divides the last close on or before each fiscal year end by that year's EPS", () => {
    const prices = [
      { t: "2024-12-27", o: null, h: null, l: null, c: 90, v: null },
      { t: "2025-01-03", o: null, h: null, l: null, c: 95, v: null },
      { t: "2025-12-26", o: null, h: null, l: null, c: 100, v: null },
    ];
    expect(historicalPE(growing, prices)).toEqual([
      { date: "2024-12-31", pe: 20 },
      { date: "2025-12-31", pe: 20 },
    ]);
  });
});

describe("long-term verdict", () => {
  it("passes a growing, profitable, cash-generating company and says so in plain words", () => {
    const v = longTermVerdict(input());
    expect(v.strategy).toBe("long-term");
    for (const id of ["revenue-growth", "profitable", "margins", "fcf", "debt", "roe", "valuation", "trend"]) {
      expect(status(v, id), id).toBe("pass");
    }
    expect(v.summary).toBe(`Meets ${v.judged} of ${v.judged} long-term checks. Every check that could be judged passed.`);
  });

  it("names its sources, with fiscal years for reported figures", () => {
    const v = longTermVerdict(input());
    const rev = v.checks.find((c) => c.id === "revenue-growth")!;
    expect(rev.detail).toContain("FY2022");
    expect(rev.detail).toContain("12.6% a year");
    expect(rev.source).toEqual({ label: "FY2025 annual report via Yahoo Finance", date: "2025-12-31" });
  });

  it("flags losses, cash burn and an expensive valuation", () => {
    const years = [...growing.slice(0, 3), year("2025-12-31", { revenue: 10e9, netIncome: -1e9, freeCashFlow: -0.5e9 })];
    const v = longTermVerdict(input({
      fin: sourced({ ticker: "X", currency: "USD", years }),
      fund: sourced(fundamentals({ valuation: { ...fundamentals().valuation, trailingPE: 60 } })),
    }));
    expect(status(v, "profitable")).toBe("fail");
    expect(status(v, "fcf")).toBe("fail");
    expect(status(v, "valuation")).toBe("fail");
    expect(v.summary).toMatch(/Falls short on: consistently profitable, positive free cash flow, reasonable valuation/);
  });

  it("doesn't judge banks on free cash flow or debt ratios", () => {
    const bank = fundamentals({ profile: { ...fundamentals().profile, sector: "Financial Services" } });
    const v = longTermVerdict(input({ fund: sourced(bank) }));
    expect(status(v, "fcf")).toBe("unknown");
    expect(status(v, "debt")).toBe("unknown");
  });

  it("compares P/E with the company's own history when prices cover its fiscal years", () => {
    const prices = growing.map((y) => ({ t: y.date, o: null, h: null, l: null, c: y.dilutedEps! * 15, v: null }));
    const v = longTermVerdict(input({ longPrices: prices }));
    const c = v.checks.find((x) => x.id === "valuation")!;
    expect(c.status).toBe("fail"); // 20 now vs 15 on average
    expect(c.detail).toBe("P/E 20.0 vs 15.0 average at the last 4 fiscal year-ends. Looks for no more than 10% above its own average.");
  });

  it("marks checks it can't judge instead of guessing", () => {
    const v = longTermVerdict(input({ fund: null, fin: null, tech: null }));
    expect(v.judged).toBe(0);
    expect(v.summary).toBe("Not enough data to judge it as a long-term investment yet.");
  });
});

describe("swing verdict", () => {
  it("passes a clean uptrend near its high, ahead of distant earnings", () => {
    const v = swingVerdict(input({ fund: sourced(fundamentals({ events: { ...fundamentals().events, earningsDate: "2026-12-01" } })) }));
    expect(v.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("warns when earnings fall inside a typical swing", () => {
    const v = swingVerdict(input({ fund: sourced(fundamentals({ events: { ...fundamentals().events, earningsDate: "2026-10-22" } })) }));
    const c = v.checks.find((x) => x.id === "earnings")!;
    expect(c.status).toBe("fail");
    expect(c.detail).toBe("Earnings in 5 days (2026-10-22): the price can gap past any stop.");
  });

  it("fails an overbought, downtrending chart", () => {
    const v = swingVerdict(input({ tech: technicals({ trend: "Downtrend", rsi14: 78, last: 80, sma50: 90 }), price: 80 }));
    expect(status(v, "trend")).toBe("fail");
    expect(status(v, "rsi")).toBe("fail");
    expect(status(v, "risk")).toBe("fail");
  });

  it("is judged separately from the long-term verdict", () => {
    const i = input({ tech: technicals({ trend: "Downtrend", rsi14: 25 }) });
    expect(swingVerdict(i).met).toBeLessThan(swingVerdict(input()).met);
    expect(longTermVerdict(i).checks.map((c) => c.id)).not.toContain("rsi");
  });
});

describe("research summary", () => {
  const news: NewsFeed = {
    ticker: "X", fetched: 3, duplicatesRemoved: 0,
    items: [
      { id: "1", title: "X Corp wins $2B defence contract", publisher: "Reuters", link: "https://example.com/1", publishedAt: "2026-10-15T10:00:00Z", relevance: "direct", alsoReportedBy: [] },
      { id: "2", title: "Regulators open probe into X Corp billing", publisher: "Bloomberg", link: "https://example.com/2", publishedAt: "2026-10-14T10:00:00Z", relevance: "direct", alsoReportedBy: [] },
      { id: "3", title: "Stocks rise as Fed holds rates", publisher: "AP", link: "https://example.com/3", publishedAt: "2026-10-14T10:00:00Z", relevance: "broad", alsoReportedBy: [] },
    ],
  };

  it("sorts headlines into catalysts and risks, linking each to its source and date", () => {
    const i = input({ news: sourced(news) });
    const s = researchSummary(i, longTermVerdict(i), swingVerdict(i));
    expect(s.catalysts).toContainEqual({ text: "In the news: “X Corp wins $2B defence contract”", source: { label: "Reuters", date: "2026-10-15T10:00:00Z", url: "https://example.com/1" } });
    expect(s.risks.map((r) => r.text)).toContain("In the news: “Regulators open probe into X Corp billing”");
    // Market-wide stories aren't about the company
    expect([...s.catalysts, ...s.risks].some((r) => r.text.includes("Fed holds"))).toBe(false);
  });

  it("derives strengths and weaknesses from the long-term checks", () => {
    const i = input();
    const s = researchSummary(i, longTermVerdict(i), swingVerdict(i));
    expect(s.strengths.some((p) => p.text.startsWith("Growing revenue:"))).toBe(true);
    expect(s.weaknesses).toEqual([]);
    expect(s.strengths.every((p) => p.source.label.length > 0)).toBe(true);
  });

  it("lists the upcoming earnings date as a catalyst and analyst upside", () => {
    const i = input();
    const s = researchSummary(i, longTermVerdict(i), swingVerdict(i));
    expect(s.catalysts.map((c) => c.text)).toEqual(expect.arrayContaining([
      "Earnings report in 34 days (2026-11-20); analysts expect EPS of $1.20",
      "20 analysts' mean target $120.00 is 20.0% above the price",
    ]));
  });

  it("names currency risk when the listing trades outside the investor's base currency", () => {
    const i = input({ currency: "SGD", baseCurrency: "USD" });
    const s = researchSummary(i, longTermVerdict(i), swingVerdict(i));
    expect(s.risks.map((r) => r.text)).toContain("Trades in SGD; your returns in USD also move with the exchange rate");
  });
});
