export interface ScreenerStock {
  ticker: string;
  name: string;
  sector: string;
  type: "Stock" | "ETF" | "REIT";
}

export const SCREENER_UNIVERSE: ScreenerStock[] = [
  // Technology
  { ticker: "AAPL",  name: "Apple Inc.",                    sector: "Technology",       type: "Stock" },
  { ticker: "MSFT",  name: "Microsoft Corp.",               sector: "Technology",       type: "Stock" },
  { ticker: "NVDA",  name: "NVIDIA Corp.",                  sector: "Technology",       type: "Stock" },
  { ticker: "ORCL",  name: "Oracle Corp.",                  sector: "Technology",       type: "Stock" },
  { ticker: "CRM",   name: "Salesforce Inc.",               sector: "Technology",       type: "Stock" },
  { ticker: "ADBE",  name: "Adobe Inc.",                    sector: "Technology",       type: "Stock" },
  { ticker: "AMD",   name: "Advanced Micro Devices",        sector: "Technology",       type: "Stock" },
  { ticker: "AVGO",  name: "Broadcom Inc.",                 sector: "Technology",       type: "Stock" },
  { ticker: "QCOM",  name: "Qualcomm Inc.",                 sector: "Technology",       type: "Stock" },
  { ticker: "INTC",  name: "Intel Corp.",                   sector: "Technology",       type: "Stock" },
  // Communication
  { ticker: "GOOGL", name: "Alphabet Inc.",                 sector: "Communication",    type: "Stock" },
  { ticker: "META",  name: "Meta Platforms Inc.",           sector: "Communication",    type: "Stock" },
  { ticker: "NFLX",  name: "Netflix Inc.",                  sector: "Communication",    type: "Stock" },
  { ticker: "DIS",   name: "Walt Disney Co.",               sector: "Communication",    type: "Stock" },
  { ticker: "T",     name: "AT&T Inc.",                     sector: "Communication",    type: "Stock" },
  { ticker: "VZ",    name: "Verizon Communications",        sector: "Communication",    type: "Stock" },
  // Consumer Disc.
  { ticker: "AMZN",  name: "Amazon.com Inc.",               sector: "Consumer Disc.",   type: "Stock" },
  { ticker: "TSLA",  name: "Tesla Inc.",                    sector: "Consumer Disc.",   type: "Stock" },
  { ticker: "HD",    name: "Home Depot Inc.",               sector: "Consumer Disc.",   type: "Stock" },
  { ticker: "NKE",   name: "Nike Inc.",                     sector: "Consumer Disc.",   type: "Stock" },
  { ticker: "MCD",   name: "McDonald's Corp.",              sector: "Consumer Disc.",   type: "Stock" },
  { ticker: "SBUX",  name: "Starbucks Corp.",               sector: "Consumer Disc.",   type: "Stock" },
  { ticker: "LOW",   name: "Lowe's Companies Inc.",         sector: "Consumer Disc.",   type: "Stock" },
  // Consumer Staples
  { ticker: "WMT",   name: "Walmart Inc.",                  sector: "Consumer Staples", type: "Stock" },
  { ticker: "PG",    name: "Procter & Gamble Co.",          sector: "Consumer Staples", type: "Stock" },
  { ticker: "KO",    name: "Coca-Cola Co.",                 sector: "Consumer Staples", type: "Stock" },
  { ticker: "PEP",   name: "PepsiCo Inc.",                  sector: "Consumer Staples", type: "Stock" },
  { ticker: "COST",  name: "Costco Wholesale Corp.",        sector: "Consumer Staples", type: "Stock" },
  { ticker: "PM",    name: "Philip Morris International",   sector: "Consumer Staples", type: "Stock" },
  // Healthcare
  { ticker: "UNH",   name: "UnitedHealth Group Inc.",       sector: "Healthcare",       type: "Stock" },
  { ticker: "LLY",   name: "Eli Lilly and Co.",             sector: "Healthcare",       type: "Stock" },
  { ticker: "JNJ",   name: "Johnson & Johnson",             sector: "Healthcare",       type: "Stock" },
  { ticker: "ABBV",  name: "AbbVie Inc.",                   sector: "Healthcare",       type: "Stock" },
  { ticker: "MRK",   name: "Merck & Co. Inc.",              sector: "Healthcare",       type: "Stock" },
  { ticker: "PFE",   name: "Pfizer Inc.",                   sector: "Healthcare",       type: "Stock" },
  { ticker: "CVS",   name: "CVS Health Corp.",              sector: "Healthcare",       type: "Stock" },
  // Financials
  { ticker: "BRK-B", name: "Berkshire Hathaway B",          sector: "Financials",       type: "Stock" },
  { ticker: "JPM",   name: "JPMorgan Chase & Co.",          sector: "Financials",       type: "Stock" },
  { ticker: "V",     name: "Visa Inc.",                     sector: "Financials",       type: "Stock" },
  { ticker: "MA",    name: "Mastercard Inc.",               sector: "Financials",       type: "Stock" },
  { ticker: "BAC",   name: "Bank of America Corp.",         sector: "Financials",       type: "Stock" },
  { ticker: "GS",    name: "Goldman Sachs Group Inc.",      sector: "Financials",       type: "Stock" },
  { ticker: "MS",    name: "Morgan Stanley",                sector: "Financials",       type: "Stock" },
  { ticker: "AXP",   name: "American Express Co.",          sector: "Financials",       type: "Stock" },
  { ticker: "WFC",   name: "Wells Fargo & Co.",             sector: "Financials",       type: "Stock" },
  // Energy
  { ticker: "XOM",   name: "Exxon Mobil Corp.",             sector: "Energy",           type: "Stock" },
  { ticker: "CVX",   name: "Chevron Corp.",                 sector: "Energy",           type: "Stock" },
  { ticker: "COP",   name: "ConocoPhillips",                sector: "Energy",           type: "Stock" },
  { ticker: "SLB",   name: "SLB (Schlumberger)",            sector: "Energy",           type: "Stock" },
  // Industrials
  { ticker: "CAT",   name: "Caterpillar Inc.",              sector: "Industrials",      type: "Stock" },
  { ticker: "BA",    name: "Boeing Co.",                    sector: "Industrials",      type: "Stock" },
  { ticker: "HON",   name: "Honeywell International",       sector: "Industrials",      type: "Stock" },
  { ticker: "LMT",   name: "Lockheed Martin Corp.",         sector: "Industrials",      type: "Stock" },
  { ticker: "GE",    name: "GE Aerospace",                  sector: "Industrials",      type: "Stock" },
  { ticker: "RTX",   name: "RTX Corp.",                     sector: "Industrials",      type: "Stock" },
  { ticker: "DE",    name: "Deere & Company",               sector: "Industrials",      type: "Stock" },
  // Utilities
  { ticker: "NEE",   name: "NextEra Energy Inc.",           sector: "Utilities",        type: "Stock" },
  { ticker: "DUK",   name: "Duke Energy Corp.",             sector: "Utilities",        type: "Stock" },
  { ticker: "SO",    name: "Southern Company",              sector: "Utilities",        type: "Stock" },
  { ticker: "D",     name: "Dominion Energy Inc.",          sector: "Utilities",        type: "Stock" },
  // Materials
  { ticker: "LIN",   name: "Linde plc",                    sector: "Materials",        type: "Stock" },
  { ticker: "APD",   name: "Air Products & Chemicals",     sector: "Materials",        type: "Stock" },
  { ticker: "FCX",   name: "Freeport-McMoRan Inc.",        sector: "Materials",        type: "Stock" },
  { ticker: "NEM",   name: "Newmont Corp.",                 sector: "Materials",        type: "Stock" },
  // Real Estate / REITs
  { ticker: "O",     name: "Realty Income Corp.",           sector: "Real Estate",      type: "REIT"  },
  { ticker: "AMT",   name: "American Tower Corp.",          sector: "Real Estate",      type: "REIT"  },
  { ticker: "PLD",   name: "Prologis Inc.",                 sector: "Real Estate",      type: "REIT"  },
  { ticker: "WELL",  name: "Welltower Inc.",                sector: "Real Estate",      type: "REIT"  },
  { ticker: "PSA",   name: "Public Storage",                sector: "Real Estate",      type: "REIT"  },
  { ticker: "VICI",  name: "VICI Properties Inc.",          sector: "Real Estate",      type: "REIT"  },
  // ETFs
  { ticker: "VOO",   name: "Vanguard S&P 500 ETF",         sector: "ETF",              type: "ETF"   },
  { ticker: "SPY",   name: "SPDR S&P 500 ETF Trust",       sector: "ETF",              type: "ETF"   },
  { ticker: "QQQ",   name: "Invesco QQQ Trust",             sector: "ETF",              type: "ETF"   },
  { ticker: "VTI",   name: "Vanguard Total Stock Market",  sector: "ETF",              type: "ETF"   },
  { ticker: "SCHD",  name: "Schwab US Dividend Equity ETF", sector: "ETF",             type: "ETF"   },
  { ticker: "VGT",   name: "Vanguard Info Technology ETF", sector: "ETF",              type: "ETF"   },
  { ticker: "IWM",   name: "iShares Russell 2000 ETF",     sector: "ETF",              type: "ETF"   },
  { ticker: "GLD",   name: "SPDR Gold Trust",              sector: "ETF",              type: "ETF"   },
];

export const SCREENER_SECTORS = [
  "Technology", "Communication", "Consumer Disc.", "Consumer Staples",
  "Healthcare", "Financials", "Energy", "Industrials", "Utilities",
  "Materials", "Real Estate", "ETF",
];
