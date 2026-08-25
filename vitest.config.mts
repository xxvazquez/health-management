import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pure-logic unit tests (canonical event generation, aggregations) plus
// IndexedDB-backed tests (the write lock, the outbox) — no real browser
// needed for either, so the default "node" environment is enough.
// fake-indexeddb polyfills the `indexedDB` global for the latter.
//
// Component tests (.test.tsx) opt into a DOM per-file via a
// `// @vitest-environment jsdom` comment at the top of the file instead of
// switching the default here — keeps every existing .test.ts file running
// exactly as before, unaffected by jsdom even being installed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["fake-indexeddb/auto", "./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./src/*" path mapping.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
