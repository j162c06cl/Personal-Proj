"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Suggestion {
  ticker: string;
  name: string;
  type: string;
  exchange: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (ticker: string, name: string) => void;
  placeholder?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export default function TickerAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Ticker symbol...",
  inputClassName = "",
  autoFocus,
  onKeyDown,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Only the newest request may update the list, so a slow early response can't replace a later one
  const requestId = useRef(0);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) { setSuggestions([]); setOpen(false); return; }
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (id !== requestId.current) return;
      setSuggestions(data.results ?? []);
      setOpen((data.results?.length ?? 0) > 0);
    } catch {
      if (id !== requestId.current) return;
      setSuggestions([]);
    }
    setLoading(false);
    setHighlighted(-1);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.toUpperCase();
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) { requestId.current++; setSuggestions([]); setOpen(false); setLoading(false); return; }
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  }

  function handleSelect(s: Suggestion) {
    requestId.current++;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(false);
    onSelect(s.ticker, s.name);
    onChange(s.ticker);
    setOpen(false);
    setSuggestions([]);
    setHighlighted(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, -1));
        return;
      }
      if (e.key === "Enter" && highlighted >= 0) {
        e.preventDefault();
        handleSelect(suggestions[highlighted]);
        return;
      }
      if (e.key === "Enter") setOpen(false);
      if (e.key === "Escape") {
        setOpen(false);
        setHighlighted(-1);
        return;
      }
    }
    onKeyDown?.(e);
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const typeBadgeColor: Record<string, string> = {
    Equity: "bg-blue-50 text-blue-600",
    ETF: "bg-purple-50 text-purple-600",
    Fund: "bg-orange-50 text-orange-600",
    Trust: "bg-gray-100 text-gray-600",
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        className={inputClassName}
      />

      {/* Loading indicator inside input */}
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="w-3.5 h-3.5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      )}

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        // At least as wide as the input, but wide enough for company names even when the input is narrow
        <div className="absolute left-0 top-full mt-1 z-50 w-[max(100%,min(420px,calc(100vw-2rem)))] max-h-[360px] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s.ticker}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                i === highlighted ? "bg-[#EAF4FF]" : "hover:bg-gray-50"
              } ${i > 0 ? "border-t border-gray-100" : ""}`}
            >
              <span className="font-bold text-sm text-gray-900 min-w-[4rem] shrink-0 font-mono">{s.ticker}</span>
              <span className="text-sm text-gray-600 flex-1 min-w-0 truncate" title={s.name}>{s.name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeBadgeColor[s.type] ?? "bg-gray-100 text-gray-500"}`}>
                  {s.type}
                </span>
                <span className="text-xs text-gray-400">{s.exchange}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
