"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSummary, peekSummary, SummaryInput } from "@/lib/data";
import { AiSummary, CitedPoint, Sourced } from "@/lib/types";

const SECTIONS: { key: keyof Pick<AiSummary, "whatHappened" | "why" | "doesItMatter" | "whatToInvestigate">; title: string }[] = [
  { key: "whatHappened", title: "What happened" },
  { key: "why", title: "Why" },
  { key: "doesItMatter", title: "Does it matter?" },
  { key: "whatToInvestigate", title: "What to investigate" },
];

function Citation({ id, summary }: { id: string; summary: AiSummary }) {
  const src = summary.sources[id];
  const cls = "inline-flex items-center text-[10px] font-bold rounded px-1 py-[1px] ml-1 align-[1px] tabular-nums";
  if (src?.link) {
    return (
      <a href={src.link} target="_blank" rel="noreferrer" title={src.label} className={`${cls} bg-[#EBF2FF] text-[#1F65F0] hover:bg-[#D6E4FF]`}>
        {id}
      </a>
    );
  }
  return <span title={src?.label ?? id} className={`${cls} bg-[#F0F0F0] text-[#525252] cursor-help`}>{id}</span>;
}

function Points({ points, summary }: { points: CitedPoint[]; summary: AiSummary }) {
  if (!points.length) return <p className="text-[13px] text-[#A3A3A3]">Nothing in today&apos;s sources addresses this.</p>;
  return (
    <ul className="space-y-1.5">
      {points.map((p, i) => (
        <li key={i} className="text-[13.5px] leading-relaxed text-[#262626] flex gap-2">
          <span className="text-[#C8C8C8] mt-[1px]">•</span>
          <span>
            {p.text}
            {p.citations.map((c) => <Citation key={c} id={c} summary={summary} />)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AiSummaryCard({
  ticker,
  input,
  apiKey,
  compact,
}: {
  ticker: string;
  /** null until the page has finished loading the data the summary is built from */
  input: SummaryInput | null;
  apiKey: string | null;
  /** 5-minute mode: show only "What happened" and "Does it matter?" */
  compact?: boolean;
}) {
  const [summary, setSummary] = useState<Sourced<AiSummary> | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSummary(undefined);
    setError(null);
    peekSummary(ticker).then(setSummary);
  }, [ticker]);

  async function generate() {
    if (!input || !apiKey) return;
    setBusy(true);
    setError(null);
    try {
      setSummary(await getSummary(input, apiKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  const shown = compact ? SECTIONS.filter((s) => s.key === "whatHappened" || s.key === "doesItMatter") : SECTIONS;

  return (
    <section className="rounded-2xl border border-[#D6E4FF] bg-gradient-to-b from-[#F5F8FF] to-white p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-bold text-[#0A0A0A] flex items-center gap-2">
            <svg className="w-4 h-4 text-[#1F65F0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            AI research summary
          </h2>
          <p className="text-[12px] text-[#525252] mt-0.5">Written only from the headlines and data on this page. Every point links to its source.</p>
        </div>
      </div>

      {summary === undefined ? (
        <div className="h-16 bg-black/[0.03] rounded-xl animate-pulse" />
      ) : summary ? (
        <div className="space-y-4">
          {shown.map((s) => (
            <div key={s.key}>
              <p className="text-[11px] font-bold text-[#1F65F0] uppercase tracking-wider mb-1.5">{s.title}</p>
              <Points points={summary.value[s.key]} summary={summary.value} />
            </div>
          ))}
          {compact && <p className="text-[12px] text-[#525252]">Switch to 15 or 30 min for the reasons and follow-ups.</p>}
          <p className="text-[11px] text-[#A3A3A3] pt-1 border-t border-[#E5EDFF]">
            {summary.source} · generated {new Date(summary.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · cached until tomorrow ·
            not investment advice
          </p>
        </div>
      ) : !apiKey ? (
        <div className="text-[13px] text-[#525252]">
          Add your Anthropic API key in{" "}
          <Link href="/settings" className="text-[#1F65F0] font-semibold hover:underline">Settings</Link>{" "}
          to get a daily summary of what happened, why, whether it matters, and what to look into.
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={generate}
            disabled={busy || !input}
            className="px-4 py-2 text-[13px] bg-[#1F65F0] text-white rounded-xl hover:bg-[#1550D8] disabled:opacity-50 font-semibold transition-colors flex items-center gap-2"
          >
            {busy && (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {busy ? "Reading the sources…" : !input ? "Loading data…" : "Generate today's summary"}
          </button>
          <span className="text-[12px] text-[#A3A3A3]">One summary per stock per day · uses your API key</span>
        </div>
      )}

      {error && <p className="text-[13px] text-[#DC2626] mt-3">{error}</p>}
    </section>
  );
}
