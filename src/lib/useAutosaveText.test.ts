// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutosaveText } from "./useAutosaveText";

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useAutosaveText", () => {
  it("saves a changed value when the app goes to the background", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useAutosaveText("old", onSave));
    act(() => result.current.setText("new note "));
    act(() => setVisibility("hidden"));
    expect(onSave).toHaveBeenCalledWith("new note");
    setVisibility("visible");
  });

  it("saves on unmount, once, and skips unchanged text", () => {
    const onSave = vi.fn();
    const { result, unmount } = renderHook(() => useAutosaveText("same", onSave));
    act(() => result.current.commit());
    expect(onSave).not.toHaveBeenCalled();
    act(() => result.current.setText("changed"));
    act(() => result.current.commit());
    unmount();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("changed");
  });
});
