export interface PresetEntry {
  ticker: string;
  name: string;
  category: string;
  sector: string;
}

export interface PresetPosition {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  purchasePrice: number;
  purchaseDate: string;
  quantity: number;
}

export const DEFAULT_WATCHLISTS = [
  { id: "stocks",   name: "Stocks",   tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"] },
  { id: "etf",      name: "ETF",      tickers: ["VOO", "SPY", "QQQ", "VTI", "SCHD", "VGT"] },
  { id: "reit",     name: "REIT",     tickers: ["O", "AMT", "WELL", "VICI", "PSA", "PLD"] },
  { id: "dividend", name: "Dividend", tickers: ["JNJ", "KO", "PG", "PEP", "MCD", "T"] },
];

export const WATCHLIST_CATEGORIES =["Stocks", "ETF", "REIT", "Dividend"];

export const WATCHLIST_PRESETS: PresetEntry[] = [
  // MAG 7
  { ticker: "AAPL",  name: "Apple Inc.",             category: "Stocks",    sector: "Technology" },
  { ticker: "MSFT",  name: "Microsoft Corp.",         category: "Stocks",    sector: "Technology" },
  { ticker: "GOOGL", name: "Alphabet Inc.",           category: "Stocks",    sector: "Communication" },
  { ticker: "AMZN",  name: "Amazon.com Inc.",         category: "Stocks",    sector: "Consumer Disc." },
  { ticker: "NVDA",  name: "NVIDIA Corp.",            category: "Stocks",    sector: "Technology" },
  { ticker: "META",  name: "Meta Platforms Inc.",     category: "Stocks",    sector: "Communication" },
  { ticker: "TSLA",  name: "Tesla Inc.",              category: "Stocks",    sector: "Consumer Disc." },
  // ETFs
  { ticker: "VOO",   name: "Vanguard S&P 500 ETF",          category: "ETF",      sector: "ETF" },
  { ticker: "SPY",   name: "SPDR S&P 500 ETF Trust",        category: "ETF",      sector: "ETF" },
  { ticker: "QQQ",   name: "Invesco QQQ Trust",             category: "ETF",      sector: "ETF" },
  { ticker: "VTI",   name: "Vanguard Total Stock Market",   category: "ETF",      sector: "ETF" },
  { ticker: "SCHD",  name: "Schwab US Dividend Equity ETF", category: "ETF",      sector: "ETF" },
  { ticker: "VGT",   name: "Vanguard Info Technology ETF",  category: "ETF",      sector: "ETF" },
  // REITs
  { ticker: "O",     name: "Realty Income Corp.",     category: "REIT",     sector: "Real Estate" },
  { ticker: "AMT",   name: "American Tower Corp.",    category: "REIT",     sector: "Real Estate" },
  { ticker: "WELL",  name: "Welltower Inc.",          category: "REIT",     sector: "Real Estate" },
  { ticker: "VICI",  name: "VICI Properties Inc.",    category: "REIT",     sector: "Real Estate" },
  { ticker: "PSA",   name: "Public Storage",          category: "REIT",     sector: "Real Estate" },
  { ticker: "PLD",   name: "Prologis Inc.",           category: "REIT",     sector: "Real Estate" },
  // Dividend
  { ticker: "JNJ",   name: "Johnson & Johnson",       category: "Dividend", sector: "Healthcare" },
  { ticker: "KO",    name: "Coca-Cola Co.",           category: "Dividend", sector: "Consumer Staples" },
  { ticker: "PG",    name: "Procter & Gamble Co.",    category: "Dividend", sector: "Consumer Staples" },
  { ticker: "PEP",   name: "PepsiCo Inc.",            category: "Dividend", sector: "Consumer Staples" },
  { ticker: "MCD",   name: "McDonald's Corp.",        category: "Dividend", sector: "Consumer Disc." },
  { ticker: "T",     name: "AT&T Inc.",               category: "Dividend", sector: "Communication" },
];

export const PORTFOLIO_PRESETS: PresetPosition[] = [
  { id: "p1", ticker: "VOO",   name: "Vanguard S&P 500 ETF",    sector: "ETF",            purchasePrice: 426.59, purchaseDate: "2022-01-03", quantity: 10  },
  { id: "p2", ticker: "AAPL",  name: "Apple Inc.",              sector: "Technology",     purchasePrice: 182.01, purchaseDate: "2022-01-03", quantity: 20  },
  { id: "p3", ticker: "MSFT",  name: "Microsoft Corp.",         sector: "Technology",     purchasePrice: 336.32, purchaseDate: "2022-01-03", quantity: 10  },
  { id: "p4", ticker: "NVDA",  name: "NVIDIA Corp.",            sector: "Technology",     purchasePrice: 294.11, purchaseDate: "2022-01-03", quantity: 15  },
  { id: "p5", ticker: "AMZN",  name: "Amazon.com Inc.",         sector: "Consumer Disc.", purchasePrice: 170.40, purchaseDate: "2022-01-03", quantity: 15  },
  { id: "p6", ticker: "GOOGL", name: "Alphabet Inc.",           sector: "Communication",  purchasePrice: 144.42, purchaseDate: "2022-01-03", quantity: 10  },
  { id: "p7", ticker: "META",  name: "Meta Platforms Inc.",     sector: "Communication",  purchasePrice: 338.54, purchaseDate: "2022-01-03", quantity: 10  },
  { id: "p8", ticker: "SCHD",  name: "Schwab US Dividend ETF",  sector: "ETF",            purchasePrice:  83.45, purchaseDate: "2022-01-03", quantity: 30  },
];

export const SECTOR_COLORS: Record<string, string> = {
  "Technology":       "#3b82f6",
  "Communication":    "#8b5cf6",
  "Consumer Disc.":   "#f59e0b",
  "ETF":              "#10b981",
  "Financials":       "#ef4444",
  "Healthcare":       "#06b6d4",
  "Energy":           "#f97316",
  "Real Estate":      "#84cc16",
  "Utilities":        "#6b7280",
  "Materials":        "#d97706",
  "Consumer Staples": "#64748b",
  "Industrials":      "#475569",
};
