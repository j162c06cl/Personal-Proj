interface GlossaryCardProps {
  term: string;
  definition: string;
  example?: string;
}

export default function GlossaryCard({ term, definition, example }: GlossaryCardProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-lg font-bold text-emerald-400 mb-2">{term}</h3>
      <p className="text-gray-300 text-sm leading-relaxed">{definition}</p>
      {example && (
        <p className="mt-3 text-xs text-gray-400 bg-gray-900 rounded-lg p-3 border-l-2 border-emerald-600">
          <span className="font-semibold text-gray-300">Example: </span>{example}
        </p>
      )}
    </div>
  );
}
