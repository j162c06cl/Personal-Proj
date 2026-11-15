import type { Benchmarks } from "./ratings";

export interface PortfolioPosition {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  purchasePrice: number;
  purchaseDate: string;
  quantity: number;
  /** Listing venue and trading currency; filled in from the provider when first looked up */
  exchange?: string;
  currency?: string;
}

export interface PortfolioPositionWithData extends PortfolioPosition {
  currentPrice: number | null;
  currentValue: number | null;
  profitLoss: number | null;
  percentReturn: number | null;
  error?: string;
}

export interface MarketIndex {
  symbol: string;
  label: string;
  format: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

export interface SectorPerf {
  symbol: string;
  label: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

export interface QuoteData {
  ticker: string;
  name: string;
  price: number | null;
  open: number | null;
  change: number | null;
  changePercent: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  marketCap: number | null;
  volume: number | null;
  avgVolume: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  pe: number | null;
  divYield: number | null;
  /** Trading currency (ISO code) and listing exchange, when the provider reports them */
  currency?: string | null;
  exchange?: string | null;
  error?: string;
  source?: string | null;
  asOf?: string;
}

export interface HistoricalResult {
  ticker: string;
  date: string;
  closingPrice: number;
  currentPrice: number;
  actualDate?: string;
}

export interface SearchResult {
  ticker: string;
  name: string;
  type: string;
  exchange?: string;
}

export interface CalculatorResult {
  ticker: string;
  purchaseDate: string;
  actualDate: string;
  priceAtPurchase: number;
  currentPrice: number;
  sharesOwned: number;
  currentValue: number;
  profitLoss: number;
  percentReturn: number;
  investmentAmount: number;
}

/** Legacy (v2) named-list watchlist; only read during migration */
export interface WatchlistDef {
  id: string;
  name: string;
  tickers: string[];
}

export type WatchIntent = "long-term" | "swing" | "research";
/** Pre-tag research status; only read when migrating older saves */
export type ResearchStatus = "not-started" | "researching" | "done";
export type WatchTag = "researching" | "watching" | "setup-ready" | "archived";

export interface WatchlistItem {
  ticker: string;
  /** Which strategy the stock is being judged by */
  intent: WatchIntent;
  tag: WatchTag;
  /** Why the stock was added, in the user's own words (or the screener's reasons) */
  note: string;
  /** The case for owning or trading it */
  thesis?: string;
  /** Price the thesis expects, in the listing's currency */
  targetPrice?: number | null;
  /** Price at which the thesis is wrong, in the listing's currency */
  invalidation?: number | null;
  addedAt: string;
  updatedAt?: string;
  exchange?: string;
  currency?: string;
  /** Name of the list it came from before intents existed, kept so nothing is lost */
  legacyList?: string;
  /** Auto-detected group (sector, or "ETFs"); saved once looked up so grouping is instant */
  category?: string;
  /** Price when it was added (or the close that day, filled in later), for "since added" */
  addedPrice?: number;
  /** Legacy (v3) research status, replaced by tag */
  status?: ResearchStatus;
}

export interface Watchlist {
  id: string;
  name: string;
  createdAt: string;
  items: WatchlistItem[];
}

export type Market = "US" | "SG";
export type ScreenStrategy = "swing" | "long-term";

/** One candidate stock as the screener sees it */
export interface ScreenerRow {
  ticker: string;
  name: string;
  quoteType: string;
  exchange: string | null;
  currency: string | null;
  price: number | null;
  changePercent: number | null;
  change52w: number | null;
  volume: number | null;
  avgVolume: number | null;
  relVolume: number | null;
  marketCap: number | null;
  pe: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  divYield: number | null;
  sma50: number | null;
  sma200: number | null;
  high52: number | null;
  low52: number | null;
  /** Next earnings date, YYYY-MM-DD in the exchange's time zone */
  earningsDate: string | null;
}

/** A saved screener configuration */
export interface SavedScreen {
  id: string;
  name: string;
  strategy: ScreenStrategy;
  market: Market;
  /** Built-in setup id, or null for filters only */
  setup: string | null;
  filters: Record<string, string>;
  updatedAt: string;
}

export type BaseCurrency = "USD" | "SGD";
export type Strategy = "long-term" | "swing" | "mixed";
export type ResearchMinutes = 5 | 15 | 30;

export interface InvestorProfile {
  strategy: Strategy;
  researchMinutes: ResearchMinutes;
  sectors: string[];
}

export interface Settings {
  baseCurrency: BaseCurrency;
  profile: InvestorProfile;
  /** Lines that colour a stock's numbers green / grey / red and drive the Buy / Hold / Sell call */
  benchmarks: Benchmarks;
}

// Every value that comes out of the data layer carries where it came from and when.
export interface Sourced<T> {
  value: T;
  source: string;
  asOf: string; // ISO timestamp of when the provider returned it
  cached: boolean;
}

export interface PricePoint {
  t: string; // YYYY-MM-DD
  o: number | null;
  h: number | null;
  l: number | null;
  c: number;
  v: number | null;
}

export type ChartRange = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

export interface ChartData {
  ticker: string;
  range: ChartRange;
  interval: string;
  currency: string;
  points: PricePoint[];
}

type N = number | null;

export interface Fundamentals {
  ticker: string;
  name: string;
  exchange: string;
  quoteType: string;
  currency: string;
  profile: { sector: string | null; industry: string | null; summary: string | null; website: string | null; employees: N; country: string | null };
  valuation: { marketCap: N; trailingPE: N; forwardPE: N; priceToBook: N; priceToSales: N; enterpriseValue: N; evToEbitda: N };
  profitability: { grossMargin: N; operatingMargin: N; profitMargin: N; returnOnEquity: N; returnOnAssets: N };
  growth: { revenueGrowth: N; earningsGrowth: N; earningsQuarterlyGrowth: N; totalRevenue: N };
  health: { totalCash: N; totalDebt: N; debtToEquity: N; currentRatio: N; freeCashflow: N };
  dividend: { yield: N; rate: N; payoutRatio: N };
  risk: { beta: N; shortPercentOfFloat: N; heldByInstitutions: N; heldByInsiders: N };
  analysts: { targetMean: N; targetHigh: N; targetLow: N; recommendation: string | null; count: N };
  events: {
    earningsDate: string | null;
    earningsDateEnd: string | null;
    earningsIsEstimate: boolean;
    epsEstimate: N;
    revenueEstimate: N;
    exDividendDate: string | null;
    dividendDate: string | null;
  };
}

/** One fiscal year of reported financials, in the company's reporting currency */
export interface FinancialYear {
  /** Fiscal year end, YYYY-MM-DD */
  date: string;
  revenue: N;
  grossProfit: N;
  operatingIncome: N;
  netIncome: N;
  dilutedEps: N;
  operatingCashFlow: N;
  capex: N;
  freeCashFlow: N;
  totalDebt: N;
  cash: N;
  equity: N;
  sharesOutstanding: N;
}

export interface FinancialHistory {
  ticker: string;
  currency: string | null;
  years: FinancialYear[];
}

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  /** direct: headline names the company; related: tagged with few tickers incl. this one; broad: market-wide story */
  relevance: "direct" | "related" | "broad";
  /** Other outlets that ran the same story; kept so de-duplication never loses a source link */
  alsoReportedBy: { publisher: string; link: string }[];
}

export interface NewsFeed {
  ticker: string;
  items: NewsItem[];
  fetched: number;
  duplicatesRemoved: number;
}

