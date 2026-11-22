"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// A choice remembered in this browser (localStorage), read straight from storage instead of
// copied into state by an effect. The server render and the first client render use the
// fallback, then the saved value, so the page hydrates without a mismatch.

const EVENT = "stored-state-change";
// Used when localStorage is unavailable (private mode, blocked storage), so choices still work
// for the visit
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/**
 * `parse` turns the saved text (null when nothing is saved) into a value and must handle
 * anything, including text saved by older versions. Define `parse` and `serialize` outside the
 * component: they are part of the memo key, so a new function each render would re-parse.
 */
export function useStoredState<T>(
  key: string,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string = String,
): [T, (next: T | ((prev: T) => T)) => void] {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const value = useMemo(() => parse(raw), [raw, parse]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    const v = typeof next === "function" ? (next as (prev: T) => T)(parse(readRaw(key))) : next;
    const text = serialize(v);
    memory.set(key, text);
    try { localStorage.setItem(key, text); } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, [key, parse, serialize]);

  return [value, set];
}

/** Parses JSON, or null if the text is missing or broken */
export function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
