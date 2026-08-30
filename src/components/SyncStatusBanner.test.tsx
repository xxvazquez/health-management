// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncStatusBanner } from "./SyncStatusBanner";
import type { OutboxEntry } from "@/lib/db/indexedDb";

const { mockUseData } = vi.hoisted(() => ({ mockUseData: vi.fn() }));
vi.mock("@/lib/DataContext", () => ({ useData: mockUseData }));

afterEach(() => {
  cleanup();
  mockUseData.mockReset();
});

function baseEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: "entry-1",
    userId: "user-1",
    dedupeKey: "symptom_items:item-1",
    table: "symptom_items",
    op: "upsert",
    payload: { id: "item-1", name: "Tiredness" },
    attempts: 1,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
    status: "dead-letter",
    lastError: "boom",
    lastErrorCode: "23503",
    ...overrides,
  };
}

function mockData(overrides: Partial<ReturnType<typeof mockUseData>> = {}) {
  mockUseData.mockReturnValue({
    syncState: { pending: 0, deadLetter: 0 },
    deadLetterEntries: [],
    retrySync: vi.fn(),
    discardSync: vi.fn(),
    ...overrides,
  });
}

describe("SyncStatusBanner", () => {
  it("renders nothing when there's nothing pending or dead-lettered", () => {
    mockData();
    const { container } = render(<SyncStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a plain pending count when nothing has permanently failed", () => {
    mockData({ syncState: { pending: 3, deadLetter: 0 } });
    render(<SyncStatusBanner />);
    expect(screen.getByText("3 changes pending sync")).toBeInTheDocument();
  });

  it("reassures instead when offline with pending changes", () => {
    mockData({ syncState: { pending: 2, deadLetter: 0 }, isOnline: false });
    render(<SyncStatusBanner />);
    expect(screen.getByText(/Offline — 2 changes are saved on this device/)).toBeInTheDocument();
  });

  it("shows the dead-letter count collapsed, then the entry list on Details", async () => {
    const entry = baseEntry();
    mockData({ syncState: { pending: 0, deadLetter: 1 }, deadLetterEntries: [entry] });
    render(<SyncStatusBanner />);

    expect(screen.getByText(/1 change failed to back up to the cloud/)).toBeInTheDocument();
    expect(screen.queryByText("Tiredness", { exact: false })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByText("Details"));
    expect(screen.getByText(/Tiredness/)).toBeInTheDocument();
  });

  it("blames the category for an item's own 23503, not the log/diary phrasing", async () => {
    const entry = baseEntry({ table: "symptom_items", op: "upsert", lastErrorCode: "23503" });
    mockData({ syncState: { pending: 0, deadLetter: 1 }, deadLetterEntries: [entry] });
    render(<SyncStatusBanner />);
    await userEvent.setup().click(screen.getByText("Details"));

    expect(screen.getByText(/it points to something \(like a category\) that's since been removed/)).toBeInTheDocument();
  });

  it("blames the not-yet-synced item for a log's own 23503, not a category", async () => {
    const entry = baseEntry({
      table: "symptom_logs",
      op: "upsert",
      lastErrorCode: "23503",
      payload: { id: "log-1", item_id: "item-1", date: "2026-08-21" },
    });
    mockData({ syncState: { pending: 0, deadLetter: 1 }, deadLetterEntries: [entry] });
    render(<SyncStatusBanner />);
    await userEvent.setup().click(screen.getByText("Details"));

    expect(screen.getByText(/the item it belongs to hasn't synced yet/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-21/)).toBeInTheDocument();
  });

  it("retries one entry by id and disables its own buttons while in flight", async () => {
    const entry = baseEntry();
    let resolveRetry!: () => void;
    const retrySync = vi.fn(() => new Promise<void>((resolve) => (resolveRetry = resolve)));
    mockData({ syncState: { pending: 0, deadLetter: 1 }, deadLetterEntries: [entry], retrySync });
    render(<SyncStatusBanner />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Details"));

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retrySync).toHaveBeenCalledWith("entry-1");
    expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();

    resolveRetry();
    expect(await screen.findByRole("button", { name: "Retry" })).not.toBeDisabled();
  });

  it("discards only after the user confirms, and does nothing on cancel", async () => {
    const entry = baseEntry();
    const discardSync = vi.fn();
    mockData({ syncState: { pending: 0, deadLetter: 1 }, deadLetterEntries: [entry], discardSync });
    render(<SyncStatusBanner />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Details"));

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(discardSync).not.toHaveBeenCalled();

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(discardSync).toHaveBeenCalledWith("entry-1");
  });
});
