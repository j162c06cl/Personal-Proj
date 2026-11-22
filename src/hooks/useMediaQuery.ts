"use client";

import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept up to date as the window changes. False on the server. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's `lg` breakpoint: laptop and wider */
export const WIDE = "(min-width: 1024px)";
