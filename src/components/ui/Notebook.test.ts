import { describe, expect, it } from "vitest";
import { headingAndPreview } from "./Notebook";

describe("headingAndPreview", () => {
  it("uses a real title as the heading and the body start as the preview", () => {
    expect(headingAndPreview("Wifi router reset", "Hold the reset button for 10s.")).toEqual({
      heading: "Wifi router reset",
      preview: "Hold the reset button for 10s.",
    });
  });

  it("falls back to the first body line as the heading when there is no title", () => {
    expect(headingAndPreview(null, "Book dentist appointment\nCall in the morning, ask about the crown")).toEqual({
      heading: "Book dentist appointment",
      preview: "Call in the morning, ask about the crown",
    });
  });

  it("treats a blank title the same as no title", () => {
    expect(headingAndPreview("   ", "Single line note")).toEqual({ heading: "Single line note", preview: "" });
  });

  it("splits a single untitled paragraph after its first sentence", () => {
    expect(headingAndPreview(null, "Slept badly again, woke at 3. Kept the morning slow after that.")).toEqual({
      heading: "Slept badly again, woke at 3.",
      preview: "Kept the morning slow after that.",
    });
  });

  it("skips leading blank lines when picking the heading", () => {
    expect(headingAndPreview("", "\n\n  First real line\nsecond")).toEqual({
      heading: "First real line",
      preview: "second",
    });
  });

  it("only says Untitled when there is nothing to show", () => {
    expect(headingAndPreview(null, "   \n  ")).toEqual({ heading: "Untitled", preview: "" });
  });

  it("clips a very long first line used as the heading", () => {
    const long = "x".repeat(200);
    const { heading } = headingAndPreview(null, long);
    expect(heading).toBe(`${"x".repeat(120)}…`);
  });
});
