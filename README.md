# The Dip

A personal stock research app that puts your own portfolio first, explains every number it shows, and runs entirely on free data.

Built with Next.js 14, TypeScript, Tailwind CSS and Recharts. No accounts, no database, no paid APIs.

![Dashboard: Market Overview](docs/screenshots/dashboard.png)

## What it does

**Market overview dashboard.** Major indices across the top, a full-width market heatmap (sized by market cap, coloured by the day's move), trending news and tickers from across the market, and the next two major US economic releases.

**Portfolio with "your holdings today".** Value, the latest session's change, total return and money invested (in US$ or S$); a growth chart of portfolio value against money put in since your first purchase; holdings that moved ±2% or on unusual volume; headlines that name a company you own; and the next 30 days of earnings, ex-dividend dates and major US releases.

**Stock analyser.** Every ticker in the app links to `/stock/[ticker]`. It opens with **two separate conclusions**, one as a long-term investment and one as a swing trade. Each is a checklist of plain rules (growth, profits, free cash flow, debt, return on equity, valuation against the company's own history, and the long trend; or trend, RSI, volume, entry level, defined risk, volatility, MACD and earnings timing). There is no overall score. Below that: a company overview (business, sector, exchange, currency, market cap), a **research summary** of strengths, weaknesses, catalysts and risks where every point names its source and date, the price chart, technicals (moving averages, RSI, 52-week high/low, 1M–1Y returns, volatility, drawdown, volume), current fundamentals and **four years of reported financials** (revenue, earnings, margins, cash flow, debt, P/E at each year end). A **5 / 15 / 30-minute research mode** controls how deep each section goes.

![Research page](docs/screenshots/research.png)

**Strategy-first screener with "Why am I seeing this?"** Choose swing trading or long-term investing first, and the market (US or Singapore). Each strategy shows only its own setups (Momentum, Breakout, Pullback; or Quality growth, Reasonable value, Dividend income, Long-term leaders) and filters (swing: RSI, volume, 1-month change, earnings dates; long-term: P/E, yield, price/book, ROE, revenue growth, margins, debt; both: market cap, sector, price vs the 50/200-day averages). Every result lists the exact rules it passed, plus how it relates to your portfolio. Screens can be saved, edited, renamed and deleted, and results added to any watchlist one at a time or all at once.

![Screener](docs/screenshots/screener.png)

**Watchlists.** Create, rename, duplicate and delete named lists. Each stock carries a status (Researching, Watching, Setup ready, Archived), a strategy, notes, a thesis, a target price and an invalidation level. The table sorts by status, price, today's move, 5-day change, volume, market cap, 52-week position, distance to target and change since added, shows prices in each listing's own currency with their timestamps, and links every stock to its analyser page.

![Watchlist](docs/screenshots/watchlist.png)

Also: portfolio tracker with sector allocation, investment-return calculator, retirement planner, economic calendar and glossary.

## Design decisions

**Every number says where it came from.** All data goes through one layer ([src/lib/data.ts](src/lib/data.ts)) that returns values as `Sourced<T>`: the value plus its provider and timestamp. The UI shows a source label next to each figure, and indicators computed in the app are labelled "Calculated from Yahoo Finance daily prices" rather than being passed off as provider data. Settings has a data-status panel showing when each feed last worked.

**Explainable screening, not a black box.** The screener's rule engine ([src/lib/rules.ts](src/lib/rules.ts)) pairs each condition with the sentence shown when it matches, so the explanation can't drift from the logic. Missing data never passes a rule.

**Your data stays on your device.** Portfolio, watchlist and settings live in the browser's IndexedDB ([src/lib/store.ts](src/lib/store.ts)), with JSON export/import for backup. Older storage formats migrate automatically.

**It degrades gracefully.** Market data comes from Yahoo Finance's unofficial endpoints, which can rate-limit or block cloud servers. The API routes fall back to a saved snapshot when a live request fails, and those values are labelled "Saved snapshot" in amber with their original timestamp, so stale data is never shown as live. The data layer also caches responses and serves its last good value if a refresh fails.

**Honest about time.** Weekend and pre-market views say "Last session (Fri, Oct 9)" rather than "Today", using the New York trading date. Earnings and dividend dates are stored as calendar dates so they don't shift a day across time zones.

## Architecture

```
Browser                                           Next.js API routes (proxy)       Upstream
┌───────────────────────────────┐                 ┌──────────────────────────┐
│ Pages (dashboard, research,   │                 │ /api/quote   /api/chart  │
│ screener, watchlist, …)       │                 │ /api/market  /api/news   │──▶ Yahoo Finance
│        │                      │   fetch         │ /api/fundamentals        │    (Stooq fallback
│        ▼                      │ ──────────────▶ │ /api/screener            │     for quotes)
│                               │                 │ /api/financials          │
│ lib/data.ts  data layer       │                 │          │ on failure    │
│  • cache in IndexedDB         │                 │          ▼               │
│  • de-duplicates requests     │                 │ lib/server/snapshot.ts   │
│  • tags source + timestamp    │                 │  saved data, labelled    │
│                               │                 └──────────────────────────┘
│ lib/store.ts  user data       │
│ lib/rules.ts  screener rules  │
│ lib/indicators.ts  RSI, MACD… │
└───────────────────────────────┘
```

| Path | Purpose |
|---|---|
| `src/lib/data.ts` | Data layer: caching, request de-duplication, source/timestamp tagging, feed health |
| `src/lib/store.ts` | IndexedDB persistence, migrations, backup export/import |
| `src/lib/rules.ts` | Swing and long-term setups, and portfolio-context reasons |
| `src/lib/screenerFilters.ts` | Screener filters per strategy, each with its explanation |
| `src/lib/analysis.ts` | Long-term and swing verdicts, and the sourced research summary |
| `src/lib/markets.ts` | Supported markets, exchanges and per-currency formatting |
| `src/lib/indicators.ts` | SMA, EMA, RSI, MACD, ATR and trend classification |
| `src/lib/server/news.ts` | Headline relevance scoring and duplicate-story merging |
| `src/lib/server/snapshot.ts` | Saved-data fallback for the API routes |
| `src/app/api/*` | Server routes that proxy and normalise Yahoo Finance |

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (rules, indicators, news, portfolio history, categories)
npm run build      # production build
```

No API keys or environment variables are required.

**Saved data for demos.** With the dev server running, `npm run snapshot` refreshes the saved data in `src/data/snapshot/` (quotes for every default ticker; full research data for nine showcase stocks). Set `DATA_MODE=snapshot` to serve only saved data, for example for a demo that must not depend on Yahoo.

## Limitations

- **Unofficial data source.** Yahoo Finance's endpoints are undocumented and can change or rate-limit without notice. Prices may be delayed, and the snapshot fallback only covers the showcase stocks in full.
- **Hand-maintained economic calendar.** Release dates in `src/lib/economicEvents.ts` need updating from the official BLS, BEA and Federal Reserve calendars.
- **Headline matching is approximate.** News relevance matches on the company name, so a listicle that mentions a company can count as news about it.
- **Markets.** US and Singapore are supported in the screener; search also finds listings on other major exchanges (London, Hong Kong, Tokyo, Toronto, Australia and others), which work everywhere a ticker is accepted. Every watchlist item and position stores its exchange and currency. Portfolio totals convert non-USD holdings at today's exchange rate, so their cost basis is approximate.
- **Screener coverage.** When Yahoo's market-wide screener doesn't respond, the screener checks a built-in list of about 135 large US companies (or about 40 large SGX listings). Filters that need fundamentals or price history (ROE, RSI…) are looked up for the 60 largest candidates.
- **Not investment advice.** Indicators and screener rules describe price history; they don't predict it.
