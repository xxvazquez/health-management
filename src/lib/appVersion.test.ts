import { afterEach, describe, expect, it, vi } from "vitest";
import { appVersionLabel } from "./appVersion";

describe("appVersionLabel", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("shows the commit date and time in Warsaw time", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.1.5");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "abc1234");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_DATE", "2026-07-01T10:30:00Z");
    expect(appVersionLabel()).toBe("Lauva v0.1.5 · abc1234 · 1 Jul 2026, 12:30");
  });

  it("omits the date when it can't be parsed", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.1.5");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_DATE", "nope");
    expect(appVersionLabel()).toBe("Lauva v0.1.5");
  });
});
