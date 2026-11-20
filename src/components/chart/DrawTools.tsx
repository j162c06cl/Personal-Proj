"use client";

import { DrawTool } from "./drawing";

const TOOLS: { id: DrawTool; label: string; title: string }[] = [
  { id: "level", label: "Level", title: "Mark your own support or resistance level" },
  { id: "trendline", label: "Trendline", title: "Draw a line between two bars" },
  { id: "note", label: "Note", title: "Attach a note to a bar" },
];

/** Drawing tool buttons. One tool is active at a time; pressing it again puts it away. */
export default function DrawTools({ tool, onChange }: { tool: DrawTool | null; onChange: (tool: DrawTool | null) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          aria-pressed={tool === t.id}
          title={t.title}
          onClick={() => onChange(tool === t.id ? null : t.id)}
          className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ${
            tool === t.id ? "bg-[#0A0A0A] border-[#0A0A0A] text-white" : "border-[#E5E5E5] text-[#525252] hover:border-[#0A0A0A]"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** What to do next with the active tool */
export function drawHint(tool: DrawTool, anchorSet: boolean, touch: boolean) {
  const click = touch ? "Tap" : "Click";
  switch (tool) {
    case "level": return `${click} the chart at the price for your level.`;
    case "trendline": return anchorSet ? `${click} where the line ends.` : `${click} where the line starts.`;
    case "note": return `${click} the bar to attach a note to.`;
  }
}
