export interface WatchlistEntry {
  id: string;
  ticker: string;
  name: string;
  category: string;
  addedAt: string;
}

export interface WatchlistEntryWithData extends WatchlistEntry {
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
  error?: string;
}

export interface PortfolioPosition {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  purchasePrice: number;
  purchaseDate: string;
  quantity: number;
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

export interface WatchlistDef {
  id: string;
  name: string;
  tickers: string[];
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
  apiKeys: { anthropic: string };
  baseCurrency: BaseCurrency;
  profile: InvestorProfile;
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

/** One cited point in an AI summary. Citations are source ids like "N2" (news item 2) or "Q" (quote data). */
export interface CitedPoint {
  text: string;
  citations: string[];
}

export interface AiSummary {
  ticker: string;
  whatHappened: CitedPoint[];
  why: CitedPoint[];
  doesItMatter: CitedPoint[];
  whatToInvestigate: CitedPoint[];
  /** Source id → what it refers to, so citations stay resolvable from the cache */
  sources: Record<string, { label: string; link?: string }>;
  model: string;
  /** Local calendar date the summary was generated for (YYYY-MM-DD) */
  forDate: string;
}

export interface DayTradeEntry {
  id: string;
  ticker: string;
  name: string;
  addedAt: string;   // ISO timestamp
  addedPrice: number;
}
