import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deno runtime, not Node/browser — its own environment, not this config's.
    "supabase/functions/**",
    // Claude Code worktrees (gitignored, one per in-progress branch) — each
    // has its own .next/out/node_modules, which the patterns above don't
    // reach since they're nested rather than at the repo root.
    ".claude/**",
  ]),
]);

export default eslintConfig;
