import { NextRequest, NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Shared Yahoo Finance auth cache (same mechanism as /api/quote)
let _auth: { cookie: string; crumb: string; ts: number } | null = null;

async function getAuth(): Promise<{ cookie: string; crumb: string } | null> {
  if (_auth && Date.now() - _auth.ts < 3_600_000) return _auth;
  try {
    const r1 = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA }, redirect: "follow", cache: "no-store",
    });
    const setCookie = r1.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/A3=([^;]+)/);
    if (!match) return null;
    const cookie = `A3=${match[1]}`;

    const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie }, cache: "no-store",
    });
    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.startsWith("<") || crumb.length < 2) return null;

    _auth = { cookie, crumb, ts: Date.now() };
    return _auth;
  } catch { return null; }
}

// Yahoo Finance screener uses short field aliases and lowercase operators —
// completely different from the quote API field names.
function buildOperands(params: Record<string, string>): unknown[] {
  const ops: unknown[] = [];

  if (params.sector) {
    const map: Record<string, string> = {
      "Technology":       "Technology",
      "Communication":    "Communication Services",
      "Consumer Disc.":   "Consumer Cyclical",
      "Consumer Staples": "Consumer Defensive",
      "Healthcare":       "Healthcare",
      "Financials":       "Financial Services",
      "Energy":           "Energy",
      "Industrials":      "Industrials",
      "Utilities":        "Utilities",
      "Materials":        "Basic Materials",
      "Real Estate":      "Real Estate",
    };
    const yf = map[params.sector];
    if (yf) ops.push({ operator: "eq", operands: ["sector", yf] });
  }

  if (params.marketCap) {
    const map: Record<string, unknown[]> = {
      "mega":  [{ operator: "gt",   operands: ["intradaymarketcap", 200_000_000_000] }],
      "large": [{ operator: "btwn", operands: ["intradaymarketcap", 10_000_000_000, 200_000_000_000] }],
      "mid":   [{ operator: "btwn", operands: ["intradaymarketcap", 2_000_000_000,  10_000_000_000] }],
      "small": [{ operator: "btwn", operands: ["intradaymarketcap", 300_000_000,     2_000_000_000] }],
      "micro": [{ operator: "btwn", operands: ["intradaymarketcap", 50_000_000,        300_000_000] }],
      "nano":  [{ operator: "lt",   operands: ["intradaymarketcap", 50_000_000] }],
    };
    ops.push(...(map[params.marketCap] ?? []));
  }

  if (params.price) {
    const map: Record<string, unknown> = {
      "1-20":    { operator: "btwn", operands: ["price", 1,   20]  },
      "u5":      { operator: "lt",   operands: ["price", 5]        },
      "5-10":    { operator: "btwn", operands: ["price", 5,   10]  },
      "u25":     { operator: "lt",   operands: ["price", 25]       },
      "25-100":  { operator: "btwn", operands: ["price", 25,  100] },
      "100-250": { operator: "btwn", operands: ["price", 100, 250] },
      "250-500": { operator: "btwn", operands: ["price", 250, 500] },
      "o500":    { operator: "gt",   operands: ["price", 500]      },
    };
    if (map[params.price]) ops.push(map[params.price]);
  }

  if (params.change) {
    const map: Record<string, unknown> = {
      "u20plus": { operator: "gt",   operands: ["percentchange", 20]    },
      "u10plus": { operator: "gt",   operands: ["percentchange", 10]    },
      "u5plus":  { operator: "gt",   operands: ["percentchange", 5]     },
      "uu":      { operator: "gt",   operands: ["percentchange", 3]     },
      "u":       { operator: "gt",   operands: ["percentchange", 1]     },
      "flat":    { operator: "btwn", operands: ["percentchange", -1, 1] },
      "d":       { operator: "lt",   operands: ["percentchange", -1]    },
      "dd":      { operator: "lt",   operands: ["percentchange", -3]    },
    };
    if (map[params.change]) ops.push(map[params.change]);
  }

  // float and relVolume are applied client-side (not valid screener filter fields)

  if (params.pe) {
    const map: Record<string, unknown> = {
      "u10":   { operator: "btwn", operands: ["pe_ratio", 0.01, 10] },
      "10-20": { operator: "btwn", operands: ["pe_ratio", 10,   20] },
      "20-30": { operator: "btwn", operands: ["pe_ratio", 20,   30] },
      "30-50": { operator: "btwn", operands: ["pe_ratio", 30,   50] },
      "o50":   { operator: "gt",   operands: ["pe_ratio", 50]       },
      "neg":   { operator: "lt",   operands: ["pe_ratio", 0]        },
    };
    if (map[params.pe]) ops.push(map[params.pe]);
  }

  if (params.divYield) {
    const map: Record<string, unknown> = {
      "none": { operator: "eq",   operands: ["annualdividendyield", 0]             },
      "u1":   { operator: "btwn", operands: ["annualdividendyield", 0.0001, 0.01]  },
      "1-2":  { operator: "btwn", operands: ["annualdividendyield", 0.01,   0.02]  },
      "2-4":  { operator: "btwn", operands: ["annualdividendyield", 0.02,   0.04]  },
      "o4":   { operator: "gt",   operands: ["annualdividendyield", 0.04]           },
    };
    if (map[params.divYield]) ops.push(map[params.divYield]);
  }

  return ops;
}

export async function GET(request: NextRequest) {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((v, k) => { if (v) params[k] = v; });

  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ results: [], error: "Yahoo Finance authentication failed — try again in a moment" });
  }

  const operands = buildOperands(params);

  // Always restrict to major US exchanges (NMS=NASDAQ, NYQ=NYSE, NGM/NCM=NASDAQ tiers, ASE=NYSE American)
  // This is the only reliable way to exclude OTC/pink-sheet stocks
  const exchangeFilter = {
    operator: "or",
    operands: [
      { operator: "eq", operands: ["exchange", "NMS"] },
      { operator: "eq", operands: ["exchange", "NYQ"] },
      { operator: "eq", operands: ["exchange", "NGM"] },
      { operator: "eq", operands: ["exchange", "NCM"] },
      { operator: "eq", operands: ["exchange", "ASE"] },
    ],
  };

  const baseOps: unknown[] = [exchangeFilter];

  // Swing presets pre-select liquid candidates here; their rules then run in the browser
  const minCap = Number(params.minCap) || 0;
  const minPrice = Number(params.minPrice) || 0;
  const minChange = params.minChange !== undefined ? Number(params.minChange) : null;
  if (minCap) baseOps.push({ operator: "gt", operands: ["intradaymarketcap", minCap] });
  if (minPrice) baseOps.push({ operator: "gt", operands: ["price", minPrice] });
  if (minChange !== null && Number.isFinite(minChange)) baseOps.push({ operator: "gt", operands: ["percentchange", minChange] });
  const sortField = params.sort === "intradaymarketcap" ? "intradaymarketcap" : "percentchange";

  // Default when no filters: top US exchange-listed stocks by market cap
  const allOps = operands.length > 0 || baseOps.length > 1
    ? [...baseOps, ...operands]
    : [...baseOps, { operator: "gt", operands: ["intradaymarketcap", 1_000_000_000] }];

  const query = { operator: "AND", operands: allOps };

  // Yahoo screener sort fields use short aliases, NOT the long quote field names
  const body = {
    offset: 0,
    size: 250,
    sortField,
    sortType: "DESC",
    quoteType: "EQUITY",
    query: query,
    userId: "",
    userIdType: "guid",
  };

  const url = `https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}&lang=en-US&region=US&formatted=false&corsDomain=finance.yahoo.com`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: auth.cookie,
        Referer: "https://finance.yahoo.com/",
        Origin: "https://finance.yahoo.com",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return NextResponse.json({ results: [], error: `Yahoo screener returned ${resp.status}`, detail: body.slice(0, 500) });
    }

    const json = await resp.json();
    const quotes: Record<string, unknown>[] = json?.finance?.result?.[0]?.quotes ?? [];

    if (!quotes.length && json?.finance?.error) {
      return NextResponse.json({ results: [], error: String(json.finance.error.description ?? "Screener error") });
    }

    const results = quotes
      .filter((q) => q.symbol && q.regularMarketPrice)
      .map((q) => {
        const vol    = (q.regularMarketVolume    as number | null) ?? null;
        const avgVol = (q.averageDailyVolume10Day as number | null) ?? (q.averageDailyVolume3Month as number | null) ?? null;
        return {
          ticker:        String(q.symbol ?? "").toUpperCase(),
          name:          String(q.shortName ?? q.longName ?? q.symbol ?? ""),
          price:         (q.regularMarketPrice         as number | null) ?? null,
          changePercent: (q.regularMarketChangePercent as number | null) ?? null,
          volume:        vol,
          avgVolume:     avgVol,
          marketCap:     (q.marketCap                       as number | null) ?? null,
          pe:            (q.trailingPE                      as number | null) ?? null,
          divYield:      (q.trailingAnnualDividendYield     as number | null) ?? null,
          floatShares:   (q.floatShares                     as number | null) ?? null,
          relVolume:     vol && avgVol && avgVol > 0 ? vol / avgVol : null,
          // Trend data for the swing preset rules
          sma50:         (q.fiftyDayAverage                 as number | null) ?? null,
          sma200:        (q.twoHundredDayAverage            as number | null) ?? null,
          high52:        (q.fiftyTwoWeekHigh                as number | null) ?? null,
          low52:         (q.fiftyTwoWeekLow                 as number | null) ?? null,
        };
      });

    return NextResponse.json({ results, total: results.length });
  } catch (e) {
    return NextResponse.json({ results: [], error: String(e) });
  }
}
