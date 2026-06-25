"use client";

import { useState } from "react";
import GlossaryCard from "@/components/GlossaryCard";

const terms = [
  {
    term: "ETF (Exchange-Traded Fund)",
    definition: "A basket of securities — stocks, bonds, or commodities — that trades on an exchange like a single stock. ETFs offer instant diversification at low cost via an expense ratio.",
    example: "VOO tracks the S&P 500, giving you exposure to 500 large US companies in one purchase.",
  },
  {
    term: "REIT (Real Estate Investment Trust)",
    definition: "A company that owns income-producing real estate. By law, REITs must distribute at least 90% of taxable income as dividends. You get real estate exposure without buying property.",
    example: "Realty Income (O) owns thousands of commercial properties and pays monthly dividends.",
  },
  {
    term: "Dividend",
    definition: "A portion of a company's profits paid to shareholders, usually quarterly. Dividend Yield = Annual Dividend ÷ Share Price × 100. Growth companies typically reinvest profits instead.",
    example: "A stock at $100 paying $4/year has a 4% dividend yield.",
  },
  {
    term: "Market Cap",
    definition: "Total market value of a company's shares. Calculated as Share Price × Total Shares Outstanding. Categories: Large Cap (>$10B), Mid Cap ($2B–$10B), Small Cap (<$2B).",
    example: "Apple's ~$3 trillion market cap makes it one of the largest companies in the world.",
  },
  {
    term: "P/E Ratio (Price-to-Earnings)",
    definition: "How much investors pay per dollar of earnings. P/E = Share Price ÷ Earnings Per Share. High P/E implies growth expectations; low P/E may mean undervaluation or slowing growth.",
    example: "P/E of 25 means you pay $25 for every $1 of annual earnings. S&P 500 historical average: 15–20.",
  },
  {
    term: "EPS (Earnings Per Share)",
    definition: "A company's net profit divided by total shares outstanding. EPS measures how much profit each share generates. Rising EPS over time generally signals a healthy, growing company.",
    example: "If a company earns $1B and has 500M shares, EPS = $2.00.",
  },
  {
    term: "Forward P/E",
    definition: "Like P/E ratio but uses estimated future earnings instead of past earnings. More useful for fast-growing companies where historical earnings don't reflect current trajectory.",
    example: "A stock at $100 with estimated $5 EPS next year has a Forward P/E of 20.",
  },
  {
    term: "PEG Ratio (Price/Earnings to Growth)",
    definition: "Adjusts the P/E ratio for growth rate. PEG = P/E ÷ Annual EPS Growth Rate. A PEG below 1 is often considered undervalued. Helps compare companies growing at different speeds.",
    example: "P/E of 30 with 30% growth = PEG of 1.0 (fairly valued).",
  },
  {
    term: "Beta",
    definition: "Measures a stock's volatility relative to the market. Beta > 1 means more volatile than the market; Beta < 1 means less volatile. Beta of 1 moves in line with the market.",
    example: "A stock with Beta 1.5 tends to rise 15% when the market rises 10%, and fall 15% when it falls 10%.",
  },
  {
    term: "ROE (Return on Equity)",
    definition: "Measures how efficiently a company generates profit from shareholders' equity. ROE = Net Income ÷ Shareholders' Equity. Higher is generally better. Warren Buffett looks for ROE > 15%.",
    example: "A company with $100M net income and $500M equity has ROE = 20%.",
  },
  {
    term: "ROIC (Return on Invested Capital)",
    definition: "Measures how well a company generates returns from all capital invested (debt + equity). ROIC > WACC means the company is creating value. One of the best measures of business quality.",
    example: "A company with 20% ROIC consistently beats one with 8% ROIC over the long term.",
  },
  {
    term: "Free Cash Flow (FCF)",
    definition: "Cash a company generates after capital expenditures. FCF = Operating Cash Flow − Capital Expenditures. Unlike earnings, FCF is hard to fake — it's real money available for dividends, buybacks, or growth.",
    example: "A company earning $500M but spending $400M on equipment has $100M FCF.",
  },
  {
    term: "CAGR (Compound Annual Growth Rate)",
    definition: "The steady annual rate at which an investment grew. Formula: (End ÷ Start)^(1÷Years) − 1. Smooths out year-to-year volatility to show the true growth rate over a period.",
    example: "$1,000 growing to $1,611 over 5 years = 10% CAGR.",
  },
  {
    term: "Compound Interest",
    definition: "Earning returns on both your principal AND accumulated returns. Over long periods this creates exponential growth. Rule of 72: divide 72 by your annual return to estimate how long money takes to double.",
    example: "$10,000 at 10%/year grows to ~$67,000 in 20 years vs $30,000 with simple interest.",
  },
  {
    term: "Dividend Yield",
    definition: "Annual dividend income as a percentage of the current share price. Dividend Yield = Annual Dividend ÷ Current Price × 100. A rising yield can mean growing dividends — or a falling stock price.",
    example: "A stock paying $3/year trading at $60 has a Dividend Yield of 5%.",
  },
  {
    term: "RSI (Relative Strength Index)",
    definition: "A momentum indicator measuring whether a stock is overbought or oversold, on a scale of 0–100. RSI > 70 = potentially overbought (may fall); RSI < 30 = potentially oversold (may rise).",
    example: "RSI of 25 after a sharp selloff may signal a potential buying opportunity.",
  },
  {
    term: "MACD (Moving Average Convergence Divergence)",
    definition: "A trend-following momentum indicator. Calculates the difference between two exponential moving averages (typically 12-day and 26-day). A 'MACD crossover' is used as a buy or sell signal.",
    example: "When the MACD line crosses above the signal line, it's considered a bullish signal.",
  },
  {
    term: "52-Week High / Low",
    definition: "The highest and lowest price a stock has traded at over the past year. Stocks breaking to new 52-week highs often continue upward (momentum); stocks near 52-week lows may be undervalued or in distress.",
    example: "A stock trading at its 52-week high of $150, having troughed at $90, has recovered significantly.",
  },
  {
    term: "Debt-to-Equity Ratio (D/E)",
    definition: "Compares total debt to shareholders' equity. D/E = Total Debt ÷ Total Equity. A high D/E means the company relies heavily on borrowed money, increasing risk. A low D/E signals financial stability.",
    example: "A D/E of 0.5 means the company has $0.50 of debt for every $1 of equity.",
  },
  {
    term: "EV/EBITDA",
    definition: "Enterprise Value divided by Earnings Before Interest, Taxes, Depreciation and Amortisation. A popular valuation multiple that accounts for debt. Often preferred over P/E for capital-intensive industries.",
    example: "An EV/EBITDA of 10 means you pay $10 for every $1 of operating earnings.",
  },
];

export default function GlossaryPage() {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? terms.filter((t) =>
        t.term.toLowerCase().includes(search.toLowerCase()) ||
        t.definition.toLowerCase().includes(search.toLowerCase())
      )
    : terms;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[28px] font-bold tracking-tight text-[#1d1d1f]">Glossary</h1>
        <p className="text-[13px] text-[#6e6e73] mt-1">Plain-English definitions for {terms.length} investing terms</p>
      </div>

      <div className="relative mb-6 max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aeaeb2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search terms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-black/[0.05] border-none rounded-2xl pl-9 pr-4 py-2.5 text-[13px] text-[#1d1d1f] placeholder-[#aeaeb2] focus:outline-none focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,113,227,0.2)] transition-all"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e6e73] hover:text-[#1d1d1f] text-[11px] font-medium">
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-[#6e6e73] py-12 text-[13px]">No terms found for &quot;{search}&quot;</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <GlossaryCard key={t.term} term={t.term} definition={t.definition} example={t.example} />
          ))}
        </div>
      )}
    </div>
  );
}
