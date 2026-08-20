import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pure-logic unit tests only (canonical event generation, aggregations) —
// no DOM needed, so the default "node" environment is enough and nothing
// beyond vitest itself is required as a dependency.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./src/*" path mapping.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
