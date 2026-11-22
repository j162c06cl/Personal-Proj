// ESLint with Next.js's recommended rules (React, hooks, accessibility basics, performance).
// Next 16 removed `next lint`, so this runs through ESLint itself: npm run lint.
// This includes the React Compiler rules from Next 16's hooks plugin, such as not setting state
// directly inside an effect.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "ss-*.cjs",
  ]),
]);
