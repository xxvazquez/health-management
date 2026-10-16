// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingSyncStatus } from "./SyncStatus";
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
    createdAt: Date.now() - 60_000,
    nextAttemptAt: Date.now(),
    status: "dead-letter",
    lastError: "boom",
    lastErrorCode: "23503",
    ...overrides,
  };
}

function mockData(overrides: Partial<ReturnType<typeof mockUseData>> = {}) {
  const pending = overrides.syncState?.pending ?? 0;
  mockUseData.mockReturnValue({
    syncState: { pending: 0, deadLetter: 0 },
    deadLetterEntries: [],
    pendingEntries: Array.from({ length: pending }, (_, i) => baseEntry({ id: `pending-${i}`, status: "pending" })),
    retrySync: vi.fn(),
    discardSync: vi.fn(),
    ...overrides,
  });
}

describe("FloatingSyncStatus", () => {
  it("renders nothing when there's nothing pending or dead-lettered", () => {
    mockData();
    const { container } = render(<FloatingSyncStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a plain pending count when nothing has permanently failed", () => {
    mockData({ syncState: { pending: 3, deadLetter: 0 } });
    render(<FloatingSyncStatus />);
    expect(screen.getByText("3 changes waiting to sync")).toBeInTheDocument();
  });

  it("waits before showing a change that's still syncing, so the page doesn't shift under a tap", () => {
    vi.useFakeTimers();
    try {
      const entry = baseEntry({ status: "pending", attempts: 0, createdAt: Date.now() });
      mockData({ syncState: { pending: 1, deadLetter: 0 }, pendingEntries: [entry] });
      const { container } = render(<FloatingSyncStatus />);
      expect(container).toBeEmptyDOMElement();

      act(() => vi.advanceTimersByTime(10_000));
      expect(screen.getByText("1 change waiting to sync")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers Retry now on pending changes and runs it", async () => {
    const retryPending = vi.fn().mockResolvedValue(undefined);
    mockData({ syncState: { pending: 2, deadLetter: 0 }, isOnline: true, retryPending });
    render(<FloatingSyncStatus />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /waiting/ }));

    await user.click(screen.getByText("Retry now"));
    expect(retryPending).toHaveBeenCalledTimes(1);
  });

  it("reassures instead of offering Retry now while offline", async () => {
    mockData({ syncState: { pending: 2, deadLetter: 0 }, isOnline: false });
    render(<FloatingSyncStatus />);
    expect(screen.getByText("Offline · 2 changes waiting")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /waiting/ }));
    expect(screen.getByText("Offline — waiting to sync")).toBeInTheDocument();
    expect(screen.queryByText("Retry now")).not.toBeInTheDocument();
  });

  it("shows the pending count, then the entry list in a sheet", async () => {
    const entry = baseEntry({ status: "pending", table: "food_items", payload: { id: "item-1", name: "Kale" } });
    mockData({ syncState: { pending: 1, deadLetter: 0 }, pendingEntries: [entry] });
    render(<FloatingSyncStatus />);

    expect(screen.getByText("1 change waiting to sync")).toBeInTheDocument();
    expect(screen.queryByText("Kale", { exact: false })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: /didn.t back up|waiting/ }));
    expect(screen.getByText("Kale")).toBeInTheDocument();
    expect(screen.getByText(/Kept on this device and sent automatically/)).toBeInTheDocument();
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument();
  });

  it("shows the latest problem once, in one line", async () => {
    const make = (id: string, nextAttemptAt: number, lastError: string) =>
      baseEntry({ id, status: "pending", table: "food_logs", nextAttemptAt, lastError, lastErrorCode: "PGRST303", payload: { id, date: "2026-09-19" } });
    mockData({ syncState: { pending: 2, deadLetter: 0 }, pendingEntries: [make("a", 1, "old"), make("b", 2, "JWT issued at future")] });
    render(<FloatingSyncStatus />);

    await userEvent.setup().click(screen.getByRole("button", { name: /didn.t back up|waiting/ }));
    expect(screen.getAllByText(/Latest problem/)).toHaveLength(1);
    expect(screen.getByText(/Latest problem: PGRST303: JWT issued at future/)).toBeInTheDocument();
  });

  it("lists each pending change with what it is and when it was saved", async () => {
    const saved = new Date(2026, 8, 19, 14, 32).getTime();
    const make = (id: string, date: string) =>
      baseEntry({ id, status: "pending", attempts: 0, createdAt: saved, table: "food_logs", payload: { id, item_id: "item-1", date, meal_tag: "Lunch" } });
    mockData({ syncState: { pending: 2, deadLetter: 0 }, pendingEntries: [make("a", "2026-09-19"), make("b", "2026-09-18")] });
    render(<FloatingSyncStatus />);

    await userEvent.setup().click(screen.getByRole("button", { name: /didn.t back up|waiting/ }));
    expect(screen.getAllByText(/Food log/)).toHaveLength(2);
    expect(screen.getByText(/2026-09-18/)).toBeInTheDocument();
    expect(screen.getAllByText(/Saved on this device 19 Sept?, 14:32 · not sent yet/)).toHaveLength(2);
  });

  it("shows failed changes straight away, then the entry list in a sheet", async () => {
    const entry = baseEntry();
    mockData({ syncState: { pending: 0, deadLetter: 1 }, deadLetterEntries: [entry] });
    render(<FloatingSyncStatus />);

    expect(screen.getByText("1 change didn't back up")).toBeInTheDocument();
    expect(screen.queryByText("Tiredness", { exact: false })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: /didn.t back up|waiting/ }));
    expect(screen.getByText(/Tiredness/)).toBeInTheDocument();
  });

  it("explains a damaged saved copy in plain language", async () => {
    const entry = baseEntry({ table: "food_logs", lastErrorCode: "LOCAL_DAMAGED", payload: { id: "log-1", date: "2026-09-19" } });
    mockData({ syncState: { pending: 0, deadLetter: 1 }, deadLetterEntries: [entry] });
    render(<FloatingSyncStatus />);
    await userEvent.setup().click(screen.getByRole("button", { name: /didn.t back up|waiting/ }));

    expect(screen.getByText(/its saved copy on this device is damaged/)).toBeInTheDocument();
  });

  it("blames the category for an item's own 23503, not the log/diary phrasing", async () => {
    const entry = baseEntry({ table: "symptom_items", op: "upsert", lastErrorCode: "23503" });
    mockData({ syncState: { pending: 0, deadLetter: 1 }, deadLetterEntries: [entry] });
    render(<FloatingSyncStatus />);
    await userEvent.setup().click(screen.getByRole("button", { name: /didn.t back up|waiting/ }));

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
    render(<FloatingSyncStatus />);
    await userEvent.setup().click(screen.getByRole("button", { name: /didn.t back up|waiting/ }));

    expect(screen.getByText(/the item it belongs to hasn't synced yet/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-21/)).toBeInTheDocument();
  });

  it("retries one entry by id and disables its own buttons while in flight", async () => {
    const entry = baseEntry();
    let resolveRetry!: () => void;
    const retrySync = vi.fn(() => new Promise<void>((resolve) => (resolveRetry = resolve)));
    mockData({ syncState: { pending: 0, deadLetter: 1 }, deadLetterEntries: [entry], retrySync });
    render(<FloatingSyncStatus />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /didn.t back up|waiting/ }));

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
    render(<FloatingSyncStatus />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /didn.t back up|waiting/ }));

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(discardSync).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(discardSync).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard" }));
    expect(discardSync).toHaveBeenCalledWith("entry-1");
  });
});
