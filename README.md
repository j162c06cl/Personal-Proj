# The Dip

> A personal stock research app that puts your own portfolio first, explains every number it shows, and runs entirely on free data.

![The Dip: market overview dashboard](docs/screenshots/dashboard.png)

## Overview

### Introduction

The Dip is a stock research app for one person's own investing. It brings market data, research, screening, watchlists, a portfolio tracker and an interactive chart into one place, and judges every stock against your own holdings and strategy.

It addresses three problems with the research tools I had been using:

- **Verdicts without reasons.** In The Dip every rating, setup and screener result lists the exact rules it passed, with the numbers and where they came from.
- **Paid data.** This project uses only free data, has no accounts, and needs no API keys.
- **Your portfolio as an afterthought.** Most tools look at a stock on its own. The Dip shows how a stock relates to what you already own, and judges it by your strategy.

The main objective was an app that would make researching more convenient. 

### Motivation

I wanted one place to check a stock against my own portfolio and strategy, instead of moving between a broker, a charting site and a news app. Building it was also a way to learn how indicators, chart patterns and backtests really work by implementing each one myself, and to see whether common setups would actually have made money on a stock once trading costs are counted and no future prices leak into the test.


## Features

1. **Market Overview**
   - Track major market indices, commodities, bonds and cryptocurrencies.
   - View market heatmaps, trending stocks and financial news.

2. **Portfolio Tracking**
   - Monitor portfolio value, daily changes, total returns and sector allocation.
   - Track holdings, company news and upcoming earnings dates.
   - Retrieve historical purchase prices with stock split adjustments.

3. **Stock Analyser**
   - Analyse stocks using fundamental and technical indicators.
   - Get strategy-based Buy, Hold or Sell assessments.
   - Review financial performance, valuation, strengths, weaknesses and risks.
   - View historical financial statements and price trends.

4. **Stock Screener**
   - Screen US and Singapore stocks based on long-term or swing trading strategies.
   - Apply fundamental and technical filters.
   - View why each stock matches your selected criteria.
   - Save custom screens and add results to watchlists.

5. **Custom Watchlists**
   - Create and manage multiple watchlists for stocks, ETFs and REITs.
   - Track prices, performance, sector information and personal notes.
   - Save investment strategies and organise stocks for further research.

6. **Interactive Stock Charts**
   - View candlestick charts across multiple timeframes.
   - Apply indicators such as SMA, EMA, VWAP, RSI and MACD.
   - Analyse price movements, volume, trends, support and resistance.
   - Add personal trendlines, price levels and chart notes.

7. **Swing Trading Setups**
   - Detect Breakout, Pullback, Bull Flag, Support Bounce and Golden Cross setups.
   - Review setup conditions, confirmation rules and invalidation levels.
   - Visualise detected setups directly on stock charts.

8. **Trade Planning**
   - Create hypothetical long and short trade plans.
   - Calculate potential risk, reward, position size and risk-to-reward ratio.
   - Visualise entry, stop-loss and target levels.

9. **Historical Backtesting**
   - Test swing trading setups against historical price data.
   - Simulate trades with brokerage fees and slippage.
   - Evaluate win rate, returns, profit factor and maximum drawdown.
   - Compare strategy performance across training and testing periods.

10. **Additional Tools**
    - Retirement planner and economic calendar.
    - Investing glossary.
    - Customisable settings, currency preferences and data backup.


## Project Demonstration

![Research page](docs/screenshots/research.png)

The research page for Apple. The header shows the price and today's move, the position held in the sample portfolio, and a 6-month price line. Four headline numbers are coloured against the benchmarks. Below the tabs, the verdict card gives one call ("Hold") for the strategy chosen in Settings: green, grey and red bars show how each tab's numbers rated, and a link switches the view to a swing trade.

![Screener](docs/screenshots/screener.png)

The screener on long-term investing in the US market. The ideas across the top are this strategy's preset screens, and the results show each stock's market cap, P/E and dividend in columns, with its price and 1-year change.

![Watchlist](docs/screenshots/watchlist.png)

The Stocks watchlist. Each row has a badge and tag coloured by sector, a 5-day price line, the price and today's move, and, under the line, how long the stock has been watched.

## Technical Implementation

### Technologies Used

- **Programming language:** TypeScript
- **Framework:** Next.js 16 (App Router) with React 19
- **Libraries:** Tailwind CSS, Recharts (research, financials, portfolio and retirement charts), TradingView Lightweight Charts (the interactive chart)
- **Data:** Yahoo Finance's public endpoints, with Stooq as a fallback for quotes; IndexedDB in the browser for caching and your own data
- **Tools:** Vitest (unit tests), Playwright (browser tests), ESLint, GitHub Actions (automatic checks), Vercel (hosting)

### System Architecture

The application uses a browser-based architecture supported by Next.js API routes.
- Market data is retrieved through API routes, with caching and fallback data handling.
- Portfolio holdings, watchlists, settings and trade plans are stored locally using IndexedDB.
- Technical indicators, stock assessments, trading setups and backtests are calculated within the application.
- Each market data value includes its source and timestamp to improve transparency.

### Implementation Details

- **Data Reliability**  Implemented caching, request handling and fallback snapshots to manage unavailable market data.
- **Explainable Analysis** Screener results and stock assessments display the rules and metrics behind each evaluation.
- **Local Data Storage** User information is stored in the browser, with JSON backup and restore functionality.
- **Backtesting Methodology** Simulated trades account for entry timing, stop-losses, transaction costs and separate training and testing periods.

## Challenges & Solutions

### Challenge 1: Handling Inconsistent Market Data

**Problem:** Market data can contain missing prices, duplicate timestamps and inconsistent trading intervals.

**Solution:** Implemented data cleaning, validation and timestamp handling. Built 4-hour candles from hourly data because the data provider does not directly offer that interval.

### Challenge 2: Managing Different Market Time Zones

**Problem:** US and Singapore markets operate in different time zones. This can affect chart timestamps and daily price movements.

**Solution:** Added exchange-specific time handling to ensure that trading dates and intraday chart times display correctly.

### Challenge 3: Improving Backtest Reliability

**Problem:** Backtests can produce misleading results if they use future price information or ignore trading costs.

**Solution:** Trades enter at the next candle's opening price and account for brokerage and slippage. Historical data is also separated into training and testing periods.

## Results & Key Learnings

**Accomplished:**

- Developed a stock research platform combining market monitoring, portfolio tracking, stock screening and analysis.
- Implemented five automated swing trading setup detectors and a historical backtesting system.
- Added explanations behind stock assessments and screening results.
- Achieved 245 unit tests and 32 browser tests.

**Key learnings:**

- Working with financial data requires careful handling of missing, delayed and inconsistent information.
- Technical indicators and stock assessments need clear rules to produce explainable results.
- Backtesting requires controls against look-ahead bias to avoid misleading performance results.
- Automated testing helps maintain reliability as the application grows.

## Current limitations

- Market data relies on unofficial Yahoo Finance endpoints, which may experience delays or rate limits.
- Intraday chart history is more limited than daily historical data.
- The screener currently supports US and Singapore markets.
- Backtesting is limited to individual stocks and available historical data.
- Portfolio currency conversions use current exchange rates, so historical cost basis calculations may be approximate.

## Future Improvements

- Integrate a licensed market data provider for more reliable and comprehensive data.
- Expand screening and backtesting to additional international markets and multiple stocks.
- Improve backtesting with dividend adjustments and more realistic trading costs.

## Installation & Usage

**Requirements:** Node.js 24 and npm. No API keys or environment variables are needed.

```bash
git clone https://github.com/j162c06cl/Personal-Proj.git
cd Personal-Proj
npm install
npm run dev        # open http://localhost:3000
```

Start on the **Dashboard**, search for any ticker to open its research page, and use **+ Watch** to add stocks to a watchlist. Set your strategy and base currency in **Settings**. Everything you save stays in your browser; use **Export backup** in Settings to keep a copy.


## Author

[j162c06cl](https://github.com/j162c06cl)

Personal Project | 2026
