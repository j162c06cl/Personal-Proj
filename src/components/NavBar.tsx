"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

function Icon({ d, className = "w-[22px] h-[22px]" }: { d: string[]; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      {d.map((p) => <path key={p} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d={p} />)}
    </svg>
  );
}

const ICONS = {
  home: ["M3 3v18h18", "M7 15l4-4 3 3 6-7"],
  watch: ["M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z", "M12 15a3 3 0 100-6 3 3 0 000 6z"],
  screen: ["M3 5h18l-7 8v6l-4 2v-8L3 5z"],
  portfolio: ["M11 3.05A9 9 0 1020.95 13H11V3.05z", "M15 3.5A9 9 0 0120.5 9H15V3.5z"],
  gear: [
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  ],
};

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/calculator", label: "Screener" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/retirement", label: "Retirement" },
  { href: "/glossary", label: "Glossary" },
  { href: "/calendar", label: "Calendar" },
];

/** The phone's bottom bar: the five places people go most */
const dock = [
  { href: "/", label: "Home", icon: ICONS.home },
  { href: "/watchlist", label: "Watchlist", icon: ICONS.watch },
  { href: "/calculator", label: "Screener", icon: ICONS.screen },
  { href: "/portfolio", label: "Portfolio", icon: ICONS.portfolio },
  { href: "/settings", label: "Settings", icon: ICONS.gear },
];

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <nav className="bg-white/95 backdrop-blur border-b border-[#F0F0F0] sticky top-0 z-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14 lg:h-16">
          <Link href="/" className="font-bold text-[19px] tracking-tight text-[#0A0A0A] shrink-0 select-none">
            The Dip
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-stretch h-full gap-0.5">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center px-3.5 text-[14px] font-medium transition-colors duration-150 border-b-2 ${
                  isActive(l.href)
                    ? "text-[#2D8CFF] font-semibold border-[#2D8CFF]"
                    : "text-[#525252] hover:text-[#0A0A0A] border-transparent"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <Link
            href="/settings"
            title="Settings"
            className={`hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-full text-[14px] font-medium transition-colors ${
              isActive("/settings") ? "text-[#2D8CFF] bg-[#EAF4FF]" : "text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F7F7F8]"
            }`}
          >
            <Icon d={ICONS.gear} className="w-[18px] h-[18px]" />
            Settings
          </Link>

          {/* Mobile: everything else lives behind the menu */}
          <button
            className="lg:hidden p-2 -mr-2 rounded-full text-[#0A0A0A] hover:bg-[#F7F7F8] transition-colors"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            <Icon d={open ? ["M6 18L18 6M6 6l12 12"] : ["M4 7h16M4 12h16M4 17h16"]} className="w-6 h-6" />
          </button>
        </div>

        {open && (
          <div className="lg:hidden border-t border-[#F0F0F0] px-4 py-3 flex flex-col gap-0.5 bg-white">
            {[...links, { href: "/settings", label: "Settings" }].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`px-3 py-2.5 rounded-full text-[15px] font-medium transition-colors ${
                  isActive(l.href) ? "text-[#2D8CFF] font-semibold bg-[#EAF4FF]" : "text-[#0A0A0A] hover:bg-[#F7F7F8]"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-[#F0F0F0] pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        <div className="flex items-stretch justify-around h-16">
          {dock.map((d) => {
            const on = isActive(d.href);
            return (
              <Link
                key={d.href}
                href={d.href}
                onClick={() => setOpen(false)}
                aria-current={on ? "page" : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${on ? "text-[#0A0A0A]" : "text-[#A3A3A3]"}`}
              >
                <Icon d={d.icon} />
                <span className={`text-[10px] ${on ? "font-semibold" : "font-medium"}`}>{d.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
