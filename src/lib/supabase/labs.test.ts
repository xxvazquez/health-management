import { describe, expect, it } from "vitest";
import { displayUnit } from "./labs";

describe("displayUnit", () => {
  it("writes exponents as superscripts", () => {
    expect(displayUnit("10^3/µL")).toBe("10³/µL");
    expect(displayUnit("10^12/L")).toBe("10¹²/L");
    expect(displayUnit("mm^-1")).toBe("mm⁻¹");
  });

  it("leaves other units alone", () => {
    expect(displayUnit("mg/dL")).toBe("mg/dL");
    expect(displayUnit(null)).toBeNull();
  });
});
