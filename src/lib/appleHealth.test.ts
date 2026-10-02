import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { appleHealthLogId } from "./appleHealth";

describe("appleHealthLogId", () => {
  it("is a stable v5-layout UUID from the SHA-1 of the import key", async () => {
    const id = await appleHealthLogId("u1", "i1", "2026-10-02");
    const hex = createHash("sha1").update("apple-health:u1:i1:2026-10-02").digest("hex").slice(0, 32);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.replace(/-/g, "").slice(0, 12)).toBe(hex.slice(0, 12));
    expect(id.replace(/-/g, "").slice(20)).toBe(hex.slice(20));
    expect(await appleHealthLogId("u1", "i1", "2026-10-02")).toBe(id);
    expect(await appleHealthLogId("u1", "i1", "2026-10-03")).not.toBe(id);
  });
});
