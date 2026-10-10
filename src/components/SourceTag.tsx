"use client";

// Small "where did this number come from" label used next to data-layer values.

function fmtAsOf(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function SourceTag({
  source,
  asOf,
  cached,
  className = "",
}: {
  source: string | null | undefined;
  asOf?: string | null;
  cached?: boolean;
  className?: string;
}) {
  if (!source) return null;
  // Saved (non-live) data is highlighted so it is never mistaken for a live price
  const saved = source.includes("Saved snapshot");
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] whitespace-nowrap ${saved ? "text-[#B45309]" : "text-[#A3A3A3]"} ${className}`}
      title={asOf ? `${source} · as of ${new Date(asOf).toLocaleString()}${cached ? " (cached)" : ""}` : source}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${saved ? "bg-[#F59E0B]" : "bg-[#D4D4D4]"}`} />
      {source}
      {asOf && <> · {fmtAsOf(asOf)}</>}
      {cached && <span className="text-[#C8C8C8]">· cached</span>}
    </span>
  );
}
