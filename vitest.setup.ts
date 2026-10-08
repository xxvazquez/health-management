// The jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...) are only
// needed by @vitest-environment jsdom files, and loading them takes seconds,
// so the plain "node" lib/ tests skip them.
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}

export {};
