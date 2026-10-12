import { describe, expect, it } from "vitest";
import { queueRowSave } from "./queueRowSave";

describe("queueRowSave", () => {
  it("applies each change onto the latest saved copy, one save at a time", async () => {
    let stored: string[] = ["teal"];
    const saves: string[][] = [];
    const save = async (value: string[]) => {
      await new Promise((r) => setTimeout(r, 5));
      stored = value;
      saves.push(value);
    };
    const fetchLatest = async () => stored;
    const common = { table: "color_palette", userId: "queue-user", local: [], fetchLatest, save };
    // Another device added "red" before this one saves.
    stored = ["teal", "red"];
    await Promise.all([
      queueRowSave({ ...common, change: (c: string[]) => [...c, "blue"] }),
      queueRowSave({ ...common, change: (c: string[]) => c.filter((x) => x !== "teal") }),
    ]);
    expect(saves).toEqual([
      ["teal", "red", "blue"],
      ["red", "blue"],
    ]);
  });

  it("falls back to the local copy when the latest can't be read", async () => {
    let saved: string[] | null = null;
    await queueRowSave({
      table: "color_palette",
      userId: "offline-user",
      local: ["teal", "blue"],
      fetchLatest: async () => Promise.reject(new Error("Failed to fetch")),
      change: (c: string[]) => (c.includes("blue") ? c : [...c, "blue"]),
      save: async (value) => {
        saved = value;
      },
    });
    expect(saved).toEqual(["teal", "blue"]);
  });
});
