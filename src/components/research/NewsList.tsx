"use client";

import { useState } from "react";
import { NewsFeed, Sourced } from "@/lib/types";
import SourceTag from "@/components/SourceTag";

export function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NewsList({ feed, limit }: { feed: Sourced<NewsFeed>; limit: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const items = showAll ? feed.value.items : feed.value.items.slice(0, limit);

  if (!feed.value.items.length) {
    return <p className="text-[13px] text-[#A3A3A3]">No recent news found for {feed.value.ticker}.</p>;
  }

  return (
    <div>
      <ol className="space-y-3.5">
        {items.map((n) => {
          const idx = feed.value.items.indexOf(n) + 1;
          return (
            <li key={n.id} className="flex gap-2.5">
              <span className="shrink-0 mt-0.5 text-[10px] font-bold text-[#525252] bg-[#F0F0F0] rounded px-1.5 py-0.5 h-fit tabular-nums">N{idx}</span>
              <div className="min-w-0">
                <a href={n.link} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-[#0A0A0A] hover:text-[#1F65F0] leading-snug block">
                  {n.title}
                </a>
                <p className="text-[11px] text-[#525252] mt-0.5">
                  {n.publisher} · {timeAgo(n.publishedAt)}
                  {n.relevance === "broad" && <span className="text-[#A3A3A3]" title="A market-wide story that mentions this stock in passing"> · market-wide</span>}
                  {n.relevance === "related" && <span className="text-[#A3A3A3]" title="Yahoo tagged this story with the stock, but the headline doesn't name it"> · tagged</span>}
                  {n.alsoReportedBy.length > 0 && (
                    <>
                      {" · "}
                      <button onClick={() => setExpanded(expanded === n.id ? null : n.id)} className="text-[#1F65F0] hover:underline">
                        +{n.alsoReportedBy.length} more source{n.alsoReportedBy.length > 1 ? "s" : ""}
                      </button>
                    </>
                  )}
                </p>
                {expanded === n.id && (
                  <ul className="mt-1 space-y-0.5">
                    {n.alsoReportedBy.map((a) => (
                      <li key={a.link}>
                        <a href={a.link} target="_blank" rel="noreferrer" className="text-[11px] text-[#1F65F0] hover:underline">{a.publisher} ↗</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {feed.value.items.length > limit && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-[12px] font-semibold text-[#1F65F0] hover:underline">
          {showAll ? "Show fewer" : `Show all ${feed.value.items.length} stories`}
        </button>
      )}
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <SourceTag source={feed.source} asOf={feed.asOf} cached={feed.cached} />
        {feed.value.duplicatesRemoved > 0 && (
          <span className="text-[11px] text-[#A3A3A3]">· {feed.value.duplicatesRemoved} duplicate{feed.value.duplicatesRemoved > 1 ? "s" : ""} merged</span>
        )}
      </div>
    </div>
  );
}
