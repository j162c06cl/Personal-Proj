// Server-only helpers for Yahoo Finance. Yahoo blocks browser calls (CORS) and
// some endpoints need a cookie + crumb, so all access goes through our API routes.

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Module-level cache — survives within a warm serverless instance
let _auth: { cookie: string; crumb: string; ts: number } | null = null;

export async function getYahooAuth(): Promise<{ cookie: string; crumb: string } | null> {
  if (_auth && Date.now() - _auth.ts < 3_600_000) return _auth;
  try {
    const r1 = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "follow",
      cache: "no-store",
    });
    const setCookie = r1.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/A3=([^;]+)/);
    if (!match) return null;
    const cookie = `A3=${match[1]}`;

    const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
      cache: "no-store",
    });
    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.startsWith("<") || crumb.length < 2) return null;

    _auth = { cookie, crumb, ts: Date.now() };
    return _auth;
  } catch { return null; }
}

export function resetYahooAuth() {
  _auth = null;
}

/** Yahoo wraps most numbers as { raw, fmt }. Unwrap to a plain number or null. */
export function raw(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && "raw" in (v as object)) {
    const r = (v as { raw: unknown }).raw;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  return null;
}

export function epochToIso(sec: number | null | undefined): string | null {
  return sec ? new Date(sec * 1000).toISOString() : null;
}
