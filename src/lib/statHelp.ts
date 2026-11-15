/**
 * One-line, plain-English explanations for the stats on the research page,
 * keyed by the label shown. The glossary page has the longer versions.
 */
export const STAT_HELP: Record<string, string> = {
  // Size & valuation
  "Market cap": "Share price × number of shares: what the market values the whole company at.",
  "P/E": "Price ÷ the last 12 months' earnings per share. Higher means investors pay more for each dollar of profit.",
  "P/E (trailing)": "Price ÷ the last 12 months' earnings per share. Higher means investors pay more for each dollar of profit.",
  "P/E (forward)": "Price ÷ analysts' expected earnings for the next 12 months. Lower than trailing P/E means profits are expected to grow.",
  "Price / sales": "Market cap ÷ yearly revenue. Useful for companies with little or no profit.",
  "Price / book": "Price ÷ the accounting value of the company's net assets per share.",
  "Enterprise value": "Market cap plus debt minus cash: roughly the price to buy the whole business outright.",
  "EV / EBITDA": "Enterprise value ÷ operating profit before depreciation. Compares valuations regardless of how a company is financed.",
  "PEG ratio": "P/E ÷ earnings growth rate. Under 1 suggests the price hasn't caught up with growth; over 2 suggests it has run ahead.",
  "P/E vs 4-yr avg": "Today's P/E compared with its average at the last four fiscal year-ends. Shows whether the stock is cheap or dear versus its own history.",
  "Mean target": "The average 12-month price target from analysts covering the stock.",
  "Upside to target": "How far the price would move to reach the analysts' average target.",
  "Consensus": "The average analyst rating, from strong buy to sell.",
  "Target range": "The lowest and highest analyst price targets.",

  // Profitability & growth
  "Gross margin": "Share of revenue left after the direct cost of making the product.",
  "Operating margin": "Share of revenue left after running costs, before interest and tax.",
  "Net margin": "Share of revenue that ends up as profit after every cost.",
  "Return on equity": "Yearly profit ÷ shareholders' equity: how well the company turns owners' money into profit.",
  "Revenue growth": "Change in revenue versus the same period a year ago.",
  "Earnings growth": "Change in earnings versus the same period a year ago.",
  "Quarterly EPS growth": "Latest quarter's earnings per share versus the same quarter a year ago.",
  "Revenue (TTM)": "Total revenue over the trailing twelve months.",

  // Financial health
  "Cash": "Cash and short-term investments on the balance sheet.",
  "Debt": "Total borrowings, short and long term.",
  "Debt / equity": "Debt ÷ shareholders' equity. Above about 2× means the company leans heavily on borrowing.",
  "Current ratio": "Short-term assets ÷ short-term liabilities. Below 1 means bills due within a year exceed what can quickly be turned into cash.",
  "Free cash flow": "Cash from operations minus capital spending: money left over to pay dividends, buy back shares or cut debt.",
  "Cash vs debt": "Cash minus total debt. A plus means the company could pay off all its debt from cash today.",

  // Dividend
  "Yield": "Yearly dividend ÷ share price.",
  "Dividend yield": "Yearly dividend ÷ share price.",
  "Annual dividend": "Dividends paid per share over a year.",
  "Payout ratio": "Share of earnings paid out as dividends. Above about 80% leaves little room if profits fall.",

  // Ownership & risk
  "Beta": "How much the stock tends to move compared with the market. 1 moves with it, 2 moves twice as much.",
  "Short % of float": "Share of tradable shares sold short, i.e. bets the price will fall.",
  "Institutions": "Share of stock held by funds, banks and other institutions.",
  "Insiders": "Share of stock held by executives, directors and major owners.",

  "Insiders own": "Share of stock held by executives, directors and major owners. High insider ownership means management's money rides with yours.",
  "Next earnings": "When the company next reports results. Prices often jump or drop sharply on the day.",

  // Technicals
  "Trend": "Uptrend when price is above its 50-day average and that is above the 200-day; downtrend when both are reversed.",
  "20-day EMA": "Exponential moving average of the last 20 days: like a simple average but weights recent days more, so it reacts faster.",
  "50-day EMA": "Exponential moving average of the last 50 days. Price holding above it is a sign of a healthy medium-term trend.",
  "50 vs 200-day": "When the 50-day average is above the 200-day (golden cross) the long-term trend is up; below it (death cross), down.",
  "Support (3-mo low)": "The lowest price of the last three months: a level where buyers have stepped in before.",
  "Resistance (3-mo high)": "The highest price of the last three months: a level where sellers have taken over before.",
  "20-day avg": "Average closing price over the last 20 trading days, about a month. Shows the short-term trend.",
  "50-day avg": "Average closing price over the last 50 trading days. Shows the medium-term trend.",
  "200-day avg": "Average closing price over the last 200 trading days. Shows the long-term trend.",
  "RSI (14)": "Momentum on a 0–100 scale over 14 days. Above 70 means it rose fast (overbought), below 30 means it fell fast (oversold).",
  "MACD": "Gap between a fast and a slow moving average. Crossing above its signal line suggests momentum is turning up.",
  "Volume": "Shares traded today, compared with the usual daily amount.",
  "Volume vs 50d avg": "Today's volume ÷ the 50-day average. Well above 1× means unusual interest.",
  "From 52-wk high": "How far the price is below its highest close of the past year.",
  "From 52-wk low": "How far the price is above its lowest close of the past year.",
  "Daily range (ATR)": "Average true range: how much the price typically moves in a day, as a % of price.",
  "Volatility (1y)": "How widely daily returns swung over the past year, annualised. Higher means a bumpier ride.",
  "Max drawdown (1y)": "Biggest fall from a peak to a later low during the past year.",
};
