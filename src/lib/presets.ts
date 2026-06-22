export interface PresetEntry {
  ticker: string;
  name: string;
  category: string;
}

export interface PresetPosition {
  id: string;
  ticker: string;
  name: string;
  purchasePrice: number;
  purchaseDate: string;
  quantity: number;
}

export const WATCHLIST_CATEGORIES = ["MAG 7", "ETF", "REIT", "Dividend"];

export const WATCHLIST_PRESETS: PresetEntry[] = [
  // MAG 7
  { ticker: "AAPL",  name: "Apple Inc.",             category: "MAG 7" },
  { ticker: "MSFT",  name: "Microsoft Corp.",         category: "MAG 7" },
  { ticker: "GOOGL", name: "Alphabet Inc.",           category: "MAG 7" },
  { ticker: "AMZN",  name: "Amazon.com Inc.",         category: "MAG 7" },
  { ticker: "NVDA",  name: "NVIDIA Corp.",            category: "MAG 7" },
  { ticker: "META",  name: "Meta Platforms Inc.",     category: "MAG 7" },
  { ticker: "TSLA",  name: "Tesla Inc.",              category: "MAG 7" },
  // ETFs
  { ticker: "VOO",   name: "Vanguard S&P 500 ETF",          category: "ETF" },
  { ticker: "SPY",   name: "SPDR S&P 500 ETF Trust",        category: "ETF" },
  { ticker: "QQQ",   name: "Invesco QQQ Trust",             category: "ETF" },
  { ticker: "VTI",   name: "Vanguard Total Stock Market",   category: "ETF" },
  { ticker: "SCHD",  name: "Schwab US Dividend Equity ETF", category: "ETF" },
  { ticker: "VGT",   name: "Vanguard Info Technology ETF",  category: "ETF" },
  // REITs
  { ticker: "O",     name: "Realty Income Corp.",     category: "REIT" },
  { ticker: "AMT",   name: "American Tower Corp.",    category: "REIT" },
  { ticker: "WELL",  name: "Welltower Inc.",          category: "REIT" },
  { ticker: "VICI",  name: "VICI Properties Inc.",   category: "REIT" },
  { ticker: "PSA",   name: "Public Storage",         category: "REIT" },
  { ticker: "PLD",   name: "Prologis Inc.",           category: "REIT" },
  // Dividend
  { ticker: "JNJ",   name: "Johnson & Johnson",       category: "Dividend" },
  { ticker: "KO",    name: "Coca-Cola Co.",           category: "Dividend" },
  { ticker: "PG",    name: "Procter & Gamble Co.",    category: "Dividend" },
  { ticker: "PEP",   name: "PepsiCo Inc.",            category: "Dividend" },
  { ticker: "MCD",   name: "McDonald's Corp.",        category: "Dividend" },
  { ticker: "T",     name: "AT&T Inc.",               category: "Dividend" },
];

// Preset portfolio — prices as of 2022-01-03
export const PORTFOLIO_PRESETS: PresetPosition[] = [
  { id: "p1", ticker: "VOO",   name: "Vanguard S&P 500 ETF",      purchasePrice: 426.59, purchaseDate: "2022-01-03", quantity: 10  },
  { id: "p2", ticker: "AAPL",  name: "Apple Inc.",                purchasePrice: 182.01, purchaseDate: "2022-01-03", quantity: 20  },
  { id: "p3", ticker: "MSFT",  name: "Microsoft Corp.",           purchasePrice: 336.32, purchaseDate: "2022-01-03", quantity: 10  },
  { id: "p4", ticker: "NVDA",  name: "NVIDIA Corp.",              purchasePrice: 294.11, purchaseDate: "2022-01-03", quantity: 15  },
  { id: "p5", ticker: "AMZN",  name: "Amazon.com Inc.",           purchasePrice: 170.40, purchaseDate: "2022-01-03", quantity: 15  },
  { id: "p6", ticker: "GOOGL", name: "Alphabet Inc.",             purchasePrice: 144.42, purchaseDate: "2022-01-03", quantity: 10  },
  { id: "p7", ticker: "META",  name: "Meta Platforms Inc.",       purchasePrice: 338.54, purchaseDate: "2022-01-03", quantity: 10  },
  { id: "p8", ticker: "SCHD",  name: "Schwab US Dividend ETF",    purchasePrice:  83.45, purchaseDate: "2022-01-03", quantity: 30  },
];
