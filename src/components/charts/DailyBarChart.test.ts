import { describe, expect, it } from "vitest";
import { dailyBuckets } from "./DailyBarChart";

describe("dailyBuckets", () => {
  it("keeps a bar a day for a month", () => {
    const b = dailyBuckets([{ date: "2026-10-01", value: 100 }, { date: "2026-10-03", value: 300 }], "2026-09-08", "2026-10-07");
    expect(b.map((x) => [x.kind, x.start, x.value])).toEqual([
      ["day", "2026-10-01", 100],
      ["day", "2026-10-03", 300],
    ]);
  });

  it("averages weeks over the days that have a value", () => {
    const b = dailyBuckets([{ date: "2026-10-05", value: 1000 }, { date: "2026-10-07", value: 3000 }], "2026-07-10", "2026-10-07");
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ kind: "week", start: "2026-10-05", value: 2000 });
  });

  it("averages months and clips the first to the window", () => {
    const b = dailyBuckets([{ date: "2025-10-20", value: 4000 }, { date: "2026-01-10", value: 6000 }], "2025-10-08", "2026-10-07");
    expect(b.map((x) => [x.kind, x.start, x.value])).toEqual([
      ["month", "2025-10-08", 4000],
      ["month", "2026-01-01", 6000],
    ]);
  });
});
