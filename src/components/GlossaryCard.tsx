interface GlossaryCardProps {
  term: string;
  definition: string;
  example?: string;
}

export default function GlossaryCard({ term, definition, example }: GlossaryCardProps) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:border-emerald-300 transition-colors">
      <h3 className="text-base font-semibold text-gray-900 mb-2">{term}</h3>
      <p className="text-gray-600 text-sm leading-relaxed">{definition}</p>
      {example && (
        <p className="mt-3 text-xs text-gray-600 bg-emerald-50 rounded-lg p-3 border-l-2 border-emerald-500">
          <span className="font-semibold text-gray-700">Example: </span>{example}
        </p>
      )}
    </div>
  );
}
