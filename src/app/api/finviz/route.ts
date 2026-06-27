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

// Convert our filter params to Yahoo Finance screener query operands
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
    if (yf) ops.push({ operator: "EQ", operands: ["sector", yf] });
  }

  if (params.marketCap) {
    const map: Record<string, unknown[]> = {
      "mega":  [{ operator: "GT",   operands: ["marketCap", 200_000_000_000] }],
      "large": [{ operator: "BTWN", operands: ["marketCap", 10_000_000_000, 200_000_000_000] }],
      "mid":   [{ operator: "BTWN", operands: ["marketCap", 2_000_000_000,  10_000_000_000] }],
      "small": [{ operator: "BTWN", operands: ["marketCap", 300_000_000,     2_000_000_000] }],
      "micro": [{ operator: "BTWN", operands: ["marketCap", 50_000_000,        300_000_000] }],
      "nano":  [{ operator: "LT",   operands: ["marketCap", 50_000_000] }],
    };
    ops.push(...(map[params.marketCap] ?? []));
  }

  if (params.price) {
    const map: Record<string, unknown> = {
      "1-20":    { operator: "BTWN", operands: ["regularMarketPrice", 1,   20]  },
      "u5":      { operator: "LT",   operands: ["regularMarketPrice", 5]        },
      "5-10":    { operator: "BTWN", operands: ["regularMarketPrice", 5,   10]  },
      "u25":     { operator: "LT",   operands: ["regularMarketPrice", 25]       },
      "25-100":  { operator: "BTWN", operands: ["regularMarketPrice", 25,  100] },
      "100-250": { operator: "BTWN", operands: ["regularMarketPrice", 100, 250] },
      "250-500": { operator: "BTWN", operands: ["regularMarketPrice", 250, 500] },
      "o500":    { operator: "GT",   operands: ["regularMarketPrice", 500]      },
    };
    if (map[params.price]) ops.push(map[params.price]);
  }

  if (params.change) {
    const map: Record<string, unknown> = {
      "u20plus": { operator: "GT",   operands: ["regularMarketChangePercent", 20]    },
      "u10plus": { operator: "GT",   operands: ["regularMarketChangePercent", 10]    },
      "u5plus":  { operator: "GT",   operands: ["regularMarketChangePercent", 5]     },
      "uu":      { operator: "GT",   operands: ["regularMarketChangePercent", 3]     },
      "u":       { operator: "GT",   operands: ["regularMarketChangePercent", 1]     },
      "flat":    { operator: "BTWN", operands: ["regularMarketChangePercent", -1, 1] },
      "d":       { operator: "LT",   operands: ["regularMarketChangePercent", -1]    },
      "dd":      { operator: "LT",   operands: ["regularMarketChangePercent", -3]    },
    };
    if (map[params.change]) ops.push(map[params.change]);
  }

  if (params.float) {
    const map: Record<string, unknown> = {
      "u1":   { operator: "LT", operands: ["floatShares",   1_000_000] },
      "u5":   { operator: "LT", operands: ["floatShares",   5_000_000] },
      "u10":  { operator: "LT", operands: ["floatShares",  10_000_000] },
      "u20":  { operator: "LT", operands: ["floatShares",  20_000_000] },
      "u50":  { operator: "LT", operands: ["floatShares",  50_000_000] },
      "u100": { operator: "LT", operands: ["floatShares", 100_000_000] },
    };
    if (map[params.float]) ops.push(map[params.float]);
  }

  if (params.pe) {
    const map: Record<string, unknown> = {
      "u10":   { operator: "BTWN", operands: ["trailingPE", 0.01, 10] },
      "10-20": { operator: "BTWN", operands: ["trailingPE", 10,   20] },
      "20-30": { operator: "BTWN", operands: ["trailingPE", 20,   30] },
      "30-50": { operator: "BTWN", operands: ["trailingPE", 30,   50] },
      "o50":   { operator: "GT",   operands: ["trailingPE", 50]       },
      "neg":   { operator: "LT",   operands: ["trailingPE", 0]        },
    };
    if (map[params.pe]) ops.push(map[params.pe]);
  }

  if (params.divYield) {
    const map: Record<string, unknown> = {
      "none": { operator: "EQ",   operands: ["trailingAnnualDividendYield", 0]               },
      "u1":   { operator: "BTWN", operands: ["trailingAnnualDividendYield", 0.0001, 0.01]    },
      "1-2":  { operator: "BTWN", operands: ["trailingAnnualDividendYield", 0.01,   0.02]    },
      "2-4":  { operator: "BTWN", operands: ["trailingAnnualDividendYield", 0.02,   0.04]    },
      "o4":   { operator: "GT",   operands: ["trailingAnnualDividendYield", 0.04]             },
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

  // Default when no filters: top 100 by volume (most active equities)
  const query = operands.length > 0
    ? { operator: "AND", operands }
    : { operator: "AND", operands: [{ operator: "GT", operands: ["regularMarketVolume", 500_000] }] };

  const body = {
    offset: 0,
    size: 100,
    sortField: "regularMarketVolume",
    sortType: "DESC",
    quoteType: "EQUITY",
    topOperator: "AND",
    query,
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
      return NextResponse.json({ results: [], error: `Yahoo screener returned ${resp.status}` });
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
        };
      });

    return NextResponse.json({ results, total: results.length });
  } catch (e) {
    return NextResponse.json({ results: [], error: String(e) });
  }
}
