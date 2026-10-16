import { afterEach, describe, expect, it, vi } from "vitest";
import { shareOrCopy } from "./share";

function stubNavigator(nav: Partial<Navigator>) {
  vi.stubGlobal("navigator", nav);
}

describe("shareOrCopy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });
    await expect(shareOrCopy({ title: "Soup", text: "Pumpkin soup" })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Soup", text: "Pumpkin soup" });
  });

  it("reports a dismissed share sheet as cancelled, without copying", async () => {
    const writeText = vi.fn();
    stubNavigator({
      share: vi.fn().mockRejectedValue(Object.assign(new Error("dismissed"), { name: "AbortError" })),
      clipboard: { writeText } as unknown as Clipboard,
    });
    await expect(shareOrCopy({ text: "x" })).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies text and link when sharing isn't available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } as unknown as Clipboard });
    await expect(shareOrCopy({ title: "Lamp", text: "Lamp", url: "https://example.com/lamp" })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Lamp\nhttps://example.com/lamp");
  });

  it("falls back to copying when sharing is refused", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({
      share: vi.fn().mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" })),
      clipboard: { writeText } as unknown as Clipboard,
    });
    await expect(shareOrCopy({ text: "SAVE10" })).resolves.toBe("copied");
  });

  it("fails when there is nothing to copy with", async () => {
    stubNavigator({});
    await expect(shareOrCopy({ text: "x" })).resolves.toBe("failed");
  });
});
