interface GlossaryCardProps {
  term: string;
  definition: string;
  example?: string;
}

export default function GlossaryCard({ term, definition, example }: GlossaryCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 transition-all duration-200 cursor-default">
      <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-2">{term}</h3>
      <p className="text-[#6e6e73] text-[13px] leading-relaxed">{definition}</p>
      {example && (
        <p className="mt-3 text-[11px] text-[#6e6e73] bg-[#e8f2ff] rounded-[10px] p-3 border-l-2 border-[#0071e3]">
          <span className="font-semibold text-[#1d1d1f]">Example: </span>{example}
        </p>
      )}
    </div>
  );
}
