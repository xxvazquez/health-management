import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pure-logic unit tests (canonical event generation, aggregations) plus
// IndexedDB-backed tests (the write lock, the outbox) — no real browser
// needed for either, so the default "node" environment is enough.
// fake-indexeddb polyfills the `indexedDB` global for the latter.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["fake-indexeddb/auto"],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./src/*" path mapping.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
