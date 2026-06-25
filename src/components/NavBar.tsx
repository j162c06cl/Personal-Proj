"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/calculator", label: "Screener" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/retirement", label: "Retirement" },
  { href: "/glossary", label: "Glossary" },
  { href: "/calendar", label: "Calendar" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-white/80 backdrop-blur-2xl border-b border-black/[0.1] sticky top-0 z-50" style={{ WebkitBackdropFilter: "blur(24px) saturate(180%)", backdropFilter: "blur(24px) saturate(180%)" }}>
      <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between h-[52px]">
        <Link href="/" className="font-bold text-[17px] tracking-tight text-[#0071e3] shrink-0">
          <span className="hidden sm:inline">Investor Research</span>
          <span className="sm:hidden">IR</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex gap-0.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-all duration-150 ${
                pathname === l.href
                  ? "bg-[#0071e3] text-white"
                  : "text-[#1d1d1f] hover:bg-black/[0.05]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden p-2 rounded-[8px] text-[#6e6e73] hover:bg-black/[0.05] transition-colors"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden border-t border-black/[0.06] px-4 py-3 flex flex-col gap-1 bg-white/95" style={{ WebkitBackdropFilter: "blur(24px)", backdropFilter: "blur(24px)" }}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`px-3 py-2 rounded-[8px] text-[13px] font-medium transition-all duration-150 ${
                pathname === l.href
                  ? "bg-[#0071e3] text-white"
                  : "text-[#1d1d1f] hover:bg-black/[0.05]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
