// ESLint with Next.js's recommended rules (React, hooks, accessibility basics, performance).
// Next 16 removed `next lint`, so this runs through ESLint itself: npm run lint.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    // Next 16's hooks plugin adds rules written for the React Compiler, which this app doesn't
    // use. They flag effects that set state (e.g. a loading flag before a fetch), which React
    // advises against for performance but which isn't a bug. Shown as warnings until those
    // components are reworked.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "ss-*.cjs",
  ]),
]);
