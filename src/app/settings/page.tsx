"use client";

import { useEffect, useRef, useState } from "react";
import { useMoney, useSettings } from "@/hooks/useSettings";
import { exportBackup, importBackup } from "@/lib/store";
import { clearCache, FeedStatus, getDataStatus } from "@/lib/data";
import { BaseCurrency, ResearchMinutes, Settings, Strategy } from "@/lib/types";

const SECTORS = [
  "Technology", "Communication", "Consumer Disc.", "Consumer Staples", "Financials",
  "Healthcare", "Energy", "Industrials", "Materials", "Real Estate", "Utilities",
];

const STRATEGIES: { value: Strategy; label: string; hint: string }[] = [
  { value: "long-term", label: "Long-term", hint: "Hold for years; focus on fundamentals" },
  { value: "swing",     label: "Swing",     hint: "Days to weeks; focus on momentum and setups" },
  { value: "mixed",     label: "Mixed",     hint: "A core of long-term holdings plus some swing trades" },
];

const RESEARCH_TIMES: { value: ResearchMinutes; label: string }[] = [
  { value: 5, label: "5 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
];

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[#E5E5E5] p-6">
      <h2 className="text-[17px] font-bold text-[#0A0A0A]">{title}</h2>
      {subtitle && <p className="text-[13px] text-[#525252] mt-1">{subtitle}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-2">{children}</p>;
}

function Segmented<T extends string | number>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex items-center bg-[#EBEBEB] rounded-xl p-1 gap-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
            value === o.value
              ? "bg-white text-[#0A0A0A] font-semibold shadow-sm border border-[#E5E5E5]"
              : "text-[#525252] hover:text-[#0A0A0A]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SettingsPage() {
  const { settings, saveSettings } = useSettings();
  const money = useMoney();
  const [savedFlash, setSavedFlash] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<{ feeds: FeedStatus[]; cacheEntries: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getDataStatus().then(setStatus); }, []);

  if (!settings) return null;

  function update(next: Settings) {
    saveSettings(next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  function setProfile<K extends keyof Settings["profile"]>(k: K, v: Settings["profile"][K]) {
    update({ ...settings!, profile: { ...settings!.profile, [k]: v } });
  }

  function toggleSector(s: string) {
    const cur = settings!.profile.sectors;
    setProfile("sectors", cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  }

  async function handleExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `the-dip-backup-${data.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBackupMsg({ ok: true, text: `Exported ${data.portfolio.length} positions, ${data.watchlists.length} watchlists and ${data.screens.length} saved screens.` });
  }

  async function handleImport(file: File) {
    try {
      const res = await importBackup(JSON.parse(await file.text()));
      setBackupMsg({ ok: true, text: `Restored ${res.positions} positions and ${res.watched} watchlist stocks.` });
    } catch (e) {
      setBackupMsg({ ok: false, text: e instanceof Error ? e.message : "Could not read that file." });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-[#0A0A0A]">Settings</h1>
          <p className="text-[14px] text-[#525252] mt-1">Everything here is stored on this device only.</p>
        </div>
        <span className={`text-[13px] font-semibold text-[#22C55E] transition-opacity ${savedFlash ? "opacity-100" : "opacity-0"}`}>
          ✓ Saved
        </span>
      </div>

      <div className="space-y-5">
        <Card title="Investor profile" subtitle="Used to personalise your dashboard, screener presets and research pages.">
          <div>
            <Label>Strategy</Label>
            <Segmented options={STRATEGIES} value={settings.profile.strategy} onChange={(v) => setProfile("strategy", v)} />
            <p className="text-[12px] text-[#A3A3A3] mt-2">
              {STRATEGIES.find((s) => s.value === settings.profile.strategy)?.hint}
            </p>
          </div>
          <div>
            <Label>Research time per stock</Label>
            <Segmented options={RESEARCH_TIMES} value={settings.profile.researchMinutes} onChange={(v) => setProfile("researchMinutes", v)} />
            <p className="text-[12px] text-[#A3A3A3] mt-2">Default depth for the stock research page. You can change it per stock.</p>
          </div>
          <div>
            <Label>Sectors to watch</Label>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map((s) => {
                const on = settings.profile.sectors.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSector(s)}
                    className={`px-3 py-1.5 rounded-xl text-[13px] font-medium border transition-colors ${
                      on
                        ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                        : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
                    }`}
                  >
                    {on && "✓ "}{s}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card title="Base currency" subtitle="Portfolio values are converted from US$ at today's exchange rate.">
          <div className="flex items-center gap-4 flex-wrap">
            <Segmented<BaseCurrency>
              options={[{ value: "USD", label: "US$" }, { value: "SGD", label: "S$" }]}
              value={settings.baseCurrency}
              onChange={(v) => update({ ...settings, baseCurrency: v })}
            />
            {money.fx && (
              <span className="text-[13px] text-[#525252]">
                1 US$ = S${money.fx.value.toFixed(4)}
                <span className="text-[#A3A3A3]"> · {money.fx.source}</span>
              </span>
            )}
          </div>
        </Card>

        <Card title="Backup" subtitle="Your portfolio and watchlists live only in this browser. Export a backup to keep them safe or move to another device.">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExport}
              className="px-4 py-2 text-[13px] bg-[#0A0A0A] text-white rounded-xl hover:bg-[#333] font-semibold transition-colors"
            >
              Export backup
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 text-[13px] font-semibold text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#0A0A0A] hover:text-[#0A0A0A] rounded-xl transition-colors"
            >
              Import backup…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
            />
          </div>
          <p className="text-[12px] text-[#A3A3A3]">Backups include portfolio, watchlists, saved screens, currency and profile. Importing replaces your current data.</p>
          {backupMsg && (
            <p className={`text-[13px] font-medium ${backupMsg.ok ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{backupMsg.text}</p>
          )}
        </Card>

        <Card title="Data status" subtitle="Where the app's data is coming from and when each feed last worked.">
          {status && status.feeds.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-[#E5E5E5]">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#F7F7F8] border-b border-[#E5E5E5]">
                    {["Feed", "Source", "Last success", "Last error"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#525252] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {status.feeds.map((f) => {
                    const failing = f.lastError && (!f.lastSuccess || f.lastError > f.lastSuccess);
                    return (
                      <tr key={f.feed}>
                        <td className="px-4 py-2.5 font-semibold text-[#0A0A0A]">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${failing ? "bg-[#EF4444]" : "bg-[#22C55E]"}`} />
                          {f.feed}
                        </td>
                        <td className="px-4 py-2.5 text-[#525252]">{f.source ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[#525252]">{timeAgo(f.lastSuccess)}</td>
                        <td className="px-4 py-2.5 text-[#525252]" title={f.errorMessage ?? ""}>
                          {f.lastError ? <span className={failing ? "text-[#EF4444]" : ""}>{timeAgo(f.lastError)}</span> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[13px] text-[#A3A3A3]">No data fetched yet. Visit the Dashboard or Portfolio to load some.</p>
          )}
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#525252]">{status?.cacheEntries ?? 0} cached items</span>
            <button
              onClick={async () => { await clearCache(); setStatus(await getDataStatus()); }}
              className="text-[13px] font-semibold text-[#525252] border border-[#E5E5E5] bg-white hover:border-[#EF4444] hover:text-[#EF4444] px-3 py-1.5 rounded-xl transition-colors"
            >
              Clear cache
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
