"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

function GearIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

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
    <nav className="bg-white border-b border-[#E5E5E5] sticky top-0 z-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="font-black text-[18px] tracking-tight text-[#0A0A0A] shrink-0 select-none">
          <span className="hidden sm:inline">Investor Research</span>
          <span className="sm:hidden">IR</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-stretch h-full gap-0.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center px-3.5 text-[14px] font-medium transition-colors duration-150 border-b-2 ${
                pathname === l.href
                  ? "text-[#0A0A0A] font-semibold border-[#0A0A0A]"
                  : "text-[#525252] hover:text-[#0A0A0A] border-transparent hover:border-[#D0D0D0]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Settings (desktop) */}
        <Link
          href="/settings"
          title="Settings"
          className={`hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-[14px] font-medium transition-colors ${
            pathname === "/settings" ? "text-[#0A0A0A] bg-[#F7F7F8]" : "text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F7F7F8]"
          }`}
        >
          <GearIcon />
          Settings
        </Link>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden p-2 rounded-lg text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F7F7F8] transition-colors"
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
        <div className="lg:hidden border-t border-[#E5E5E5] px-4 py-3 flex flex-col gap-0.5 bg-white">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                pathname === l.href
                  ? "bg-[#0A0A0A] text-white font-semibold"
                  : "text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F7F7F8]"
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
