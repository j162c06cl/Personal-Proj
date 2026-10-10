import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { AiSummary, CitedPoint, NewsItem } from "@/lib/types";

// Generates the per-stock AI research summary from data the app already fetched.
// Claude sees only the numbered sources below and must cite them; it has no web access.

const MODEL = "claude-opus-5-5";

interface FactBlock {
  id: string;       // single capital letter, e.g. "Q"
  label: string;    // e.g. "Quote & price action"
  source: string;   // e.g. "Yahoo Finance"
  asOf: string;
  lines: string[];
}

interface SummaryRequest {
  ticker: string;
  name: string;
  forDate: string;
  news: NewsItem[];
  facts: FactBlock[];
  profile?: { strategy?: string };
}

const pointSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    citations: { type: "array", items: { type: "string" } },
  },
  required: ["text", "citations"],
  additionalProperties: false,
} as const;

const SCHEMA = {
  type: "object",
  properties: {
    whatHappened: { type: "array", items: pointSchema },
    why: { type: "array", items: pointSchema },
    doesItMatter: { type: "array", items: pointSchema },
    whatToInvestigate: { type: "array", items: pointSchema },
  },
  required: ["whatHappened", "why", "doesItMatter", "whatToInvestigate"],
  additionalProperties: false,
} as const;

const SYSTEM = `You write short research briefs on a single stock for an individual investor.

You are given numbered sources: news headlines (N1, N2, ...) and data blocks (single letters such as Q, F, T, E, P). These are the only facts you may use. You have no other knowledge of recent events; do not add facts, figures or events that are not in the sources.

Answer four questions:
- whatHappened: the notable recent developments and price action.
- why: the reasons the sources give for those developments. If the sources don't explain a price move, say plainly that the available headlines don't explain it. Do not speculate beyond the sources.
- doesItMatter: whether this is likely significant for someone holding or researching the stock, given the fundamentals and the investor's context. Distinguish lasting changes from noise.
- whatToInvestigate: 2-4 concrete follow-ups the investor could check themselves (e.g. a filing, an upcoming earnings date, a metric to watch).

Rules:
- Every point must cite at least one source id in its citations array, e.g. ["N2", "Q"]. Use only ids that appear in the sources.
- News sources are headlines only, not full articles. Don't claim details a headline doesn't state.
- Headlines marked as market-wide are only loosely connected to this stock; don't present them as company news. If there is little company-specific news, say so.
- 1-3 points per section, each one or two plain sentences. No jargon without a short explanation.
- Describe; don't recommend buying or selling.`;

function buildPrompt(req: SummaryRequest): string {
  const news = req.news.length
    ? req.news.map((n, i) =>
        `[N${i + 1}] ${n.title}\n     ${n.publisher}, ${new Date(n.publishedAt).toISOString().slice(0, 10)}` +
        (n.relevance === "broad" ? " [market-wide story; mentions this stock in passing]" : n.relevance === "related" ? " [tagged with this stock]" : "") +
        (n.alsoReportedBy.length ? ` (also reported by ${n.alsoReportedBy.map((a) => a.publisher).join(", ")})` : "")
      ).join("\n")
    : "(no recent headlines found)";
  const facts = req.facts
    .map((f) => `[${f.id}] ${f.label} (${f.source}, as of ${f.asOf.slice(0, 16).replace("T", " ")} UTC)\n` + f.lines.map((l) => `     ${l}`).join("\n"))
    .join("\n\n");
  const profile = req.profile?.strategy ? `\nThe investor describes their strategy as: ${req.profile.strategy}.` : "";

  return `Stock: ${req.ticker} (${req.name}). Today is ${req.forDate}.${profile}

NEWS HEADLINES
${news}

DATA
${facts}`;
}

function cleanPoints(points: CitedPoint[] | undefined, valid: Set<string>): CitedPoint[] {
  return (points ?? [])
    .map((p) => ({ text: String(p.text ?? "").trim(), citations: (p.citations ?? []).map(String).filter((c) => valid.has(c)) }))
    // A point with no resolvable citation isn't grounded in the fetched data, so drop it
    .filter((p) => p.text && p.citations.length > 0);
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-anthropic-key")?.trim() || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Add your Anthropic API key in Settings to enable AI summaries.", code: "no_key" }, { status: 400 });
  }

  let body: SummaryRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body?.ticker || !Array.isArray(body.news) || !Array.isArray(body.facts)) {
    return NextResponse.json({ error: "ticker, news and facts are required" }, { status: 400 });
  }
  body.news = body.news.slice(0, 15);
  body.facts = body.facts.filter((f) => /^[A-Z]$/.test(f.id));

  const sources: AiSummary["sources"] = {};
  body.news.forEach((n, i) => { sources[`N${i + 1}`] = { label: `${n.publisher}: ${n.title}`, link: n.link }; });
  body.facts.forEach((f) => { sources[f.id] = { label: `${f.label} (${f.source})` }; });
  const valid = new Set(Object.keys(sources));

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(body) }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      // If a request is declined by a safety classifier, let the API retry it on Anthropic's recommended fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The model declined to summarise this stock." }, { status: 502 });
    }
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "The summary was cut off. Try again." }, { status: 502 });
    }

    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(text) as Omit<AiSummary, "ticker" | "sources" | "model" | "forDate">;

    const summary: AiSummary = {
      ticker: body.ticker,
      whatHappened: cleanPoints(parsed.whatHappened, valid),
      why: cleanPoints(parsed.why, valid),
      doesItMatter: cleanPoints(parsed.doesItMatter, valid),
      whatToInvestigate: cleanPoints(parsed.whatToInvestigate, valid),
      sources,
      model: response.model,
      forDate: body.forDate,
    };
    return NextResponse.json({ ...summary, source: `Claude (${response.model})`, asOf: new Date().toISOString() });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Your Anthropic API key was rejected. Check it in Settings.", code: "bad_key" }, { status: 401 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited by the Anthropic API. Try again in a minute." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Anthropic API error ${e.status}: ${e.message}` }, { status: 502 });
    }
    if (e instanceof SyntaxError) {
      return NextResponse.json({ error: "The summary came back in an unexpected format. Try again." }, { status: 502 });
    }
    return NextResponse.json({ error: "Could not reach the Anthropic API." }, { status: 502 });
  }
}
