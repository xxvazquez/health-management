// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NoteThreadList } from "./NoteThreadList";
import type { NoteThread } from "@/lib/supabase/notes";

afterEach(() => {
  cleanup();
});

const noop = async () => {};

function thread(overrides: Partial<NoteThread>): NoteThread {
  return {
    id: "t1",
    senderId: "me",
    recipientId: "partner",
    category: "note",
    subject: "Dinner plans",
    body: "Pasta tonight?",
    createdAt: "2026-09-20T18:00:00.000Z",
    lastMessageAt: "2026-09-20T18:00:00.000Z",
    isUnreadForMe: false,
    isSeenByPartner: false,
    partnerReadAt: null,
    isFavouritedByMe: false,
    isArchivedByMe: false,
    isMine: true,
    ...overrides,
  };
}

function renderSent(t: NoteThread) {
  render(
    <NoteThreadList
      threads={[t]}
      loading={false}
      error={false}
      view="sent"
      partnerLabel="your partner"
      onOpen={() => {}}
      onToggleFavourite={noop}
      onMarkRead={noop}
      onMarkUnread={noop}
      onChanged={() => {}}
    />,
  );
}

describe("NoteThreadList on Sent", () => {
  it("flags a message the partner hasn't opened", () => {
    renderSent(thread({}));
    expect(screen.getByText("Not read yet")).toBeTruthy();
    expect(screen.getByText("Dinner plans").style.fontWeight).toBe("600");
    expect(screen.queryByLabelText("Mark as unread")).toBeNull();
  });

  it("shows when the partner read it", () => {
    renderSent(thread({ isSeenByPartner: true, partnerReadAt: "2026-09-20T19:30:00.000Z" }));
    expect(screen.getByText(/^Read /)).toBeTruthy();
    expect(screen.getByText("Dinner plans").style.fontWeight).toBe("500");
  });

  it("calls out a reply you haven't opened", () => {
    renderSent(thread({ isUnreadForMe: true, isSeenByPartner: true, partnerReadAt: "2026-09-21T08:00:00.000Z" }));
    expect(screen.getByText("New reply")).toBeTruthy();
  });
});
