"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/benchmarks", label: "Benchmarks" },
];

export default function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-[#E5E5E5] mb-6">
      {TABS.map((t) => {
        const on = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3.5 py-2.5 -mb-px text-[14px] font-medium border-b-2 transition-colors ${
              on ? "text-[#0A0A0A] font-semibold border-[#2D8CFF]" : "text-[#525252] border-transparent hover:text-[#0A0A0A]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
