// News de-duplication: the same story is often syndicated or re-headlined by
// several outlets. Merge those into one item while keeping every source link.
import type { NewsItem } from "@/lib/types";

export interface RawNews {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  relatedTickers?: string[];
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "its", "has", "have", "will",
  "you", "your", "into", "after", "over", "about", "what", "why", "how", "now", "new", "stock", "stocks", "shares",
]);

function tokens(title: string): Set<string> {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
  );
}

/** Jaccard similarity of headline word sets */
function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((w) => { if (b.has(w)) inter++; });
  return inter / (a.size + b.size - inter);
}

const RANK: Record<NewsItem["relevance"], number> = { direct: 0, related: 1, broad: 2 };

const NAME_SUFFIX = /\b(inc|corp|corporation|co|company|ltd|plc|holdings|group|class [a-z]|the)\b\.?/gi;

/** Words that identify the company in a headline, e.g. "NVIDIA Corporation" → ["nvidia"] */
export function companyKeywords(ticker: string, name: string | null): string[] {
  const words = (name ?? "").replace(NAME_SUFFIX, " ").replace(/[^A-Za-z0-9&\- ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  return Array.from(new Set([ticker.toLowerCase(), ...(words.length ? [words[0].toLowerCase()] : [])]));
}

export function relevanceOf(n: RawNews, ticker: string, keywords: string[]): NewsItem["relevance"] {
  const title = ` ${(n.title ?? "").toLowerCase().replace(/[^a-z0-9&\- ]/g, " ")} `;
  if (keywords.some((k) => title.includes(` ${k} `) || title.includes(` ${k}'`) || title.includes(` ${k}s `))) return "direct";
  const tags = (n.relatedTickers ?? []).map((t) => t.toUpperCase());
  // Yahoo lists the story's main subject first; multi-ticker listicles put most tickers later
  if (tags[0] === ticker || (tags.length === 1 && tags.includes(ticker))) return "related";
  return "broad";
}

export function dedupeNews(items: (RawNews & { relevance: NewsItem["relevance"] })[]): NewsItem[] {
  const kept: (NewsItem & { _tokens: Set<string> })[] = [];
  const seenLinks = new Set<string>();

  // Newest first, so the kept copy is the most recent version of a story
  const sorted = [...items].sort((a, b) => (b.providerPublishTime ?? 0) - (a.providerPublishTime ?? 0));

  for (const n of sorted) {
    if (!n.title || !n.link || seenLinks.has(n.link)) continue;
    seenLinks.add(n.link);
    const t = tokens(n.title);
    const dup = kept.find((k) => similarity(k._tokens, t) >= 0.6);
    if (dup) {
      if (n.publisher) dup.alsoReportedBy.push({ publisher: n.publisher, link: n.link });
      if (RANK[n.relevance] < RANK[dup.relevance]) dup.relevance = n.relevance;
      continue;
    }
    kept.push({
      id: n.uuid ?? n.link,
      title: n.title,
      publisher: n.publisher ?? "Unknown",
      link: n.link,
      publishedAt: new Date((n.providerPublishTime ?? Date.now() / 1000) * 1000).toISOString(),
      relevance: n.relevance,
      alsoReportedBy: [],
      _tokens: t,
    });
  }
  return kept.map(({ _tokens, ...rest }) => { void _tokens; return rest; });
}
