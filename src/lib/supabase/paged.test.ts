import { describe, expect, it } from "vitest";
import { fetchPaged, PAGE_SIZE } from "./paged";

describe("fetchPaged", () => {
  it("reads every page until a short one", async () => {
    const all = Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, i) => i);
    const calls: [number, number][] = [];
    const rows = await fetchPaged<number>(async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(rows).toEqual(all);
    expect(calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
      [PAGE_SIZE * 2, PAGE_SIZE * 3 - 1],
    ]);
  });

  it("throws the first error instead of returning a partial list", async () => {
    const boom = new Error("boom");
    await expect(
      fetchPaged(async (from) => (from === 0 ? { data: Array(PAGE_SIZE).fill(0), error: null } : { data: null, error: boom })),
    ).rejects.toBe(boom);
  });
});
