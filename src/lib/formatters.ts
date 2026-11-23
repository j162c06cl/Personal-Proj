export function formatCurrency(n: number | null, currency: "USD" | "SGD" = "USD"): string {
  if (n === null || isNaN(n)) return "N/A";
  const body = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  // Intl renders SGD as a bare "$" in en-SG, so label it explicitly as S$
  return currency === "SGD" ? body.replace("$", "S$") : body;
}

export function formatLargeNumber(n: number | null): string {
  if (n === null || isNaN(n)) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return formatCurrency(n);
}

export function formatPercent(n: number | null, showSign = true): string {
  if (n === null || isNaN(n)) return "N/A";
  const sign = showSign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatDate(s: string): string {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatVolume(n: number | null): string {
  if (n === null || isNaN(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}
