/** A titled card in the panel beside the chart */
export default function PanelCard({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-[#E5E5E5] rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[14px] font-bold text-[#0A0A0A]">{title}</h2>
        {aside && <span className="text-[11px] text-[#A3A3A3]">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** "How is this worked out?" disclosure at the foot of a card */
export function HowItWorks({ summary = "How this is worked out", children }: { summary?: string; children: React.ReactNode }) {
  return (
    <details className="mt-3 text-[12px] text-[#525252]">
      <summary className="cursor-pointer font-semibold text-[#2D8CFF] select-none">{summary}</summary>
      <div className="mt-1.5 space-y-1.5 leading-relaxed">{children}</div>
    </details>
  );
}
