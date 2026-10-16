// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic } from "./haptic";

function setPointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: coarse }) as unknown as typeof window.matchMedia;
}

describe("haptic", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("vibrates where the Vibration API exists", () => {
    setPointer(true);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    haptic();
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("toggles a hidden switch and cleans it up where it doesn't", () => {
    setPointer(true);
    const toggled = vi.fn();
    document.addEventListener("change", toggled);
    haptic();
    expect(toggled).toHaveBeenCalledTimes(1);
    expect(document.head.querySelector("label")).toBeNull();
    document.removeEventListener("change", toggled);
  });

  it("does nothing with a mouse", () => {
    setPointer(false);
    const toggled = vi.fn();
    document.addEventListener("change", toggled);
    haptic();
    expect(toggled).not.toHaveBeenCalled();
    document.removeEventListener("change", toggled);
  });
});
