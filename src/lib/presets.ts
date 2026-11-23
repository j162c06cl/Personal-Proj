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
