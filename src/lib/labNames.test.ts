import { describe, expect, it } from "vitest";
import { labName } from "./labNames";

describe("labName", () => {
  it("shows Polish names in English and back", () => {
    expect(labName("Morfologia", "en")).toBe("CBC");
    expect(labName("Bazocyty %", "en")).toBe("Basophils %");
    expect(labName("żelazo", "en")).toBe("Iron");
    expect(labName("Basophils", "pl")).toBe("Bazocyty");
  });

  it("leaves names without an equivalent as stored", () => {
    expect(labName("TSH", "en")).toBe("TSH");
    expect(labName("Bazocyty", "pl")).toBe("Bazocyty");
  });
});
