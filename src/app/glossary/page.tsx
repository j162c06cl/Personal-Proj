import GlossaryCard from "@/components/GlossaryCard";

const terms = [
  {
    term: "ETF (Exchange-Traded Fund)",
    definition: "A basket of securities — like stocks or bonds — that trades on an exchange just like a single stock. ETFs let you invest in many companies at once, reducing risk through diversification. They typically have low fees (expense ratios).",
    example: "VOO is an ETF that tracks the S&P 500, giving you exposure to 500 large US companies in one purchase.",
  },
  {
    term: "REIT (Real Estate Investment Trust)",
    definition: "A company that owns income-producing real estate. By law, REITs must distribute at least 90% of their taxable income as dividends to shareholders, making them popular for income investors. You can invest in real estate without actually buying property.",
    example: "O (Realty Income) is a REIT that owns thousands of commercial properties and pays monthly dividends.",
  },
  {
    term: "Dividend",
    definition: "A portion of a company's profits paid out to shareholders, usually quarterly. Dividend yield is calculated as: annual dividend ÷ share price × 100. Not all companies pay dividends — growth companies typically reinvest profits instead.",
    example: "If a stock trades at $100 and pays $4/year in dividends, its dividend yield is 4%.",
  },
  {
    term: "Market Capitalisation (Market Cap)",
    definition: "The total market value of a company's outstanding shares. Calculated as: share price × total shares. Companies are classified as Large Cap (>$10B), Mid Cap ($2B–$10B), or Small Cap (<$2B). Larger companies are generally more stable; smaller ones may offer higher growth.",
    example: "Apple's market cap of ~$3 trillion makes it one of the largest companies in the world.",
  },
  {
    term: "P/E Ratio (Price-to-Earnings)",
    definition: "A valuation metric showing how much investors pay per dollar of earnings. Calculated as: share price ÷ earnings per share. A high P/E suggests investors expect strong future growth. A low P/E may indicate the stock is undervalued — or that growth is slowing.",
    example: "A P/E of 25 means you're paying $25 for every $1 of annual earnings. The S&P 500 historical average is around 15–20.",
  },
  {
    term: "CAGR (Compound Annual Growth Rate)",
    definition: "The steady annual rate at which an investment would have grown to reach its final value. Formula: (End Value ÷ Start Value)^(1 ÷ Years) − 1. CAGR smooths out year-to-year volatility to show the 'real' growth rate over a period.",
    example: "An investment growing from $1,000 to $1,611 over 5 years has a CAGR of 10% per year.",
  },
  {
    term: "Compound Interest",
    definition: "Earning returns not just on your original investment, but also on the returns you've already earned. Over time this creates exponential growth. Albert Einstein reportedly called it the 'eighth wonder of the world.' The Rule of 72 lets you estimate doubling time: divide 72 by your annual return.",
    example: "$10,000 at 10%/year compounded grows to ~$67,000 in 20 years — compared to just $30,000 with simple interest.",
  },
];

export default function GlossaryPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Glossary</h1>
        <p className="text-gray-400 text-sm mt-1">Plain-English definitions for common investing terms</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {terms.map((t) => (
          <GlossaryCard key={t.term} term={t.term} definition={t.definition} example={t.example} />
        ))}
      </div>
    </div>
  );
}
