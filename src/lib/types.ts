export interface WatchlistEntry {
  id: string;
  ticker: string;
  name: string;
  category: string;
  addedAt: string;
}

export interface WatchlistEntryWithData extends WatchlistEntry {
  price: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  peRatio: number | null;
  revenue: number | null;
  netIncome: number | null;
  error?: string;
}

export interface PortfolioPosition {
  id: string;
  ticker: string;
  name: string;
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

export interface QuoteData {
  ticker: string;
  name: string;
  price: number | null;
  marketCap: number | null;
  peRatio: number | null;
  revenue: number | null;
  netIncome: number | null;
  error?: string;
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
