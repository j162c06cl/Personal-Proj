"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SETUP_CONFIG, ParamDef, SETUP_PARAMS, SetupConfig, changedRules, sanitizeSetupConfig } from "@/lib/marketData/setups";

/** A number field that only applies its value on Enter or when it loses focus, so typing "12"
 *  isn't clamped at "1" on the way */
function NumberField({ def, value, onCommit }: { def: ParamDef; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(v)) onCommit(v);
    else setDraft(String(value));
  };
  return (
    <input
      type="number" inputMode="decimal" min={def.min} max={def.max} step={def.step} value={draft}
      aria-label={def.label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      className="w-[72px] px-2 py-1 text-[13px] tabular-nums border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#2D8CFF]"
    />
  );
}

/** Every threshold the setup rules use, editable, with its default */
export default function SetupRulesPanel({ config, onChange }: { config: SetupConfig; onChange: (c: SetupConfig) => void }) {
  const changed = new Set(changedRules(config));
  const set = (group: keyof SetupConfig, key: string, v: number | boolean) =>
    onChange(sanitizeSetupConfig({ ...config, [group]: { ...config[group], [key]: v } }));

  return (
    <div className="mt-2 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-[#525252]">
          Changes apply straight away and are saved in this browser. {changed.size > 0 && <b>{changed.size} changed.</b>}
        </p>
        <button
          onClick={() => onChange(DEFAULT_SETUP_CONFIG)}
          disabled={changed.size === 0}
          className="shrink-0 text-[12px] font-semibold text-[#2D8CFF] hover:underline disabled:text-[#A3A3A3] disabled:no-underline"
        >
          Reset to defaults
        </button>
      </div>
      {SETUP_PARAMS.map(({ group, title, params }) => (
        <fieldset key={group}>
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-[#A3A3A3] mb-1.5">{title}</legend>
          <div className="space-y-2">
            {params.map((p) => {
              const value = (config[group] as unknown as Record<string, number | boolean>)[p.key];
              const def = (DEFAULT_SETUP_CONFIG[group] as unknown as Record<string, number | boolean>)[p.key];
              const isChanged = changed.has(`${group}.${p.key}`);
              return (
                <div key={p.key} className={`rounded-lg px-2 py-1.5 ${isChanged ? "bg-[#F3EEFF]" : ""}`}>
                  {p.kind === "boolean" ? (
                    <label className="flex items-start gap-2 text-[12px] text-[#0A0A0A] cursor-pointer">
                      <input type="checkbox" checked={!!value} onChange={(e) => set(group, p.key, e.target.checked)} className="mt-0.5 accent-[#7C3AED]" />
                      <span>{p.label}</span>
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap text-[12px] text-[#0A0A0A]">
                      <span className="flex-1 min-w-[120px]">{p.label}</span>
                      <NumberField def={p} value={value as number} onCommit={(v) => set(group, p.key, v)} />
                      {p.unit && <span className="text-[#525252]">{p.unit}</span>}
                    </div>
                  )}
                  <p className="text-[11px] text-[#A3A3A3] mt-0.5">
                    {p.help} Default: {typeof def === "boolean" ? (def ? "on" : "off") : def}.
                  </p>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
