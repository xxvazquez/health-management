// Adds the jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...) to
// every test file's `expect`, regardless of environment — a no-op import
// for the plain "node" lib/ tests, required for anything under
// @vitest-environment jsdom that asserts on rendered output.
import "@testing-library/jest-dom/vitest";
