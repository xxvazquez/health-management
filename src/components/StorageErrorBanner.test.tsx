// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageErrorBanner } from "./StorageErrorBanner";
import { putItem } from "@/lib/db/indexedDb";
import type { RawItem } from "@/lib/types";
import "fake-indexeddb/auto";

afterEach(() => {
  cleanup();
});

const item: RawItem = {
  identity: "storage-item-1",
  itemType: "food",
  rawName: "Pear",
  category: "Fruit",
  categoryId: null,
  isArchived: false,
  createdDate: "2026-01-01",
  reminderTime: null,
  unit: null,
};

describe("StorageErrorBanner", () => {
  it("renders nothing until a local write fails", () => {
    const { container } = render(<StorageErrorBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("appears when a local write hits a full disk, and can be dismissed", async () => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("disk full", "QuotaExceededError");
    };
    try {
      render(<StorageErrorBanner />);
      await act(async () => {
        await expect(putItem(item)).rejects.toThrow("disk full");
      });
      expect(screen.getByRole("alert")).toHaveTextContent(/out of storage space/);

      await userEvent.setup().click(screen.getByText("Dismiss"));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      IDBObjectStore.prototype.put = original;
    }
  });

  it("ignores an ordinary error that isn't a storage failure", async () => {
    const { withDataLock } = await import("@/lib/db/indexedDb");
    render(<StorageErrorBanner />);
    await act(async () => {
      await expect(withDataLock(async () => Promise.reject(new Error("No workout item found")))).rejects.toThrow();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
