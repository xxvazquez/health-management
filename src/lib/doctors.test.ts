import { describe, expect, it } from "vitest";
import { DEFAULT_DOCTOR_SPECIALTIES, resolveSpecialtyNames } from "./doctors";

describe("resolveSpecialtyNames", () => {
  it("offers the defaults until the user has rows, then only their unarchived ones plus extras, de-duped A–Z", () => {
    expect(resolveSpecialtyNames([])).toEqual([...DEFAULT_DOCTOR_SPECIALTIES].sort((a, b) => a.localeCompare(b)));

    const rows = [
      { name: "Dermatology", isArchived: false },
      { name: "Cardiology", isArchived: true },
    ];
    expect(resolveSpecialtyNames(rows, [" dermatology ", "Allergy", ""])).toEqual(["Allergy", "Dermatology"]);
  });
});
