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
    isFavourite: false,
    isMine: true,
    ...overrides,
  };
}

function renderAll(threads: NoteThread[]) {
  render(
    <NoteThreadList
      threads={threads}
      loading={false}
      error={false}
      partnerLabel="your partner"
      onOpen={() => {}}
      onToggleFavourite={noop}
      onMarkRead={noop}
      onMarkUnread={noop}
      onDelete={noop}
      view="all"
      onChanged={() => {}}
    />,
  );
}

describe("NoteThreadList", () => {
  it("lists conversations either partner started in one list", () => {
    renderAll([thread({}), thread({ id: "t2", subject: "Weekend", senderId: "partner", recipientId: "me", isMine: false })]);
    expect(screen.getByText("Dinner plans")).toBeTruthy();
    expect(screen.getByText("Weekend")).toBeTruthy();
  });

  it("shows a read conversation with its preview and no unread weight", () => {
    renderAll([thread({ isSeenByPartner: true, partnerReadAt: "2026-09-20T19:30:00.000Z" })]);
    expect(screen.getByText(/Pasta tonight\?/)).toBeTruthy();
    expect(screen.getByText("Dinner plans").style.fontWeight).toBe("400");
    expect(screen.getByLabelText("Mark as unread")).toBeTruthy();
  });

  it("says whether the partner has read my latest message", () => {
    renderAll([thread({}), thread({ id: "t2", subject: "Weekend", isSeenByPartner: true })]);
    expect(screen.getByText("Not read yet")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();
  });

  it("shows no read receipt when the partner wrote last", () => {
    renderAll([thread({ lastMessage: "Sounds good", lastMessageIsMine: false })]);
    expect(screen.queryByText("Not read yet")).toBeNull();
    expect(screen.queryByText("Read")).toBeNull();
  });

  it("stars a favourite", () => {
    renderAll([thread({ isFavourite: true })]);
    expect(screen.getByRole("img", { name: "Favourite" })).toBeTruthy();
  });

  it("previews the latest message", () => {
    renderAll([thread({ lastMessage: "See you at 7" })]);
    expect(screen.getByText(/See you at 7/)).toBeTruthy();
  });

  it("marks a conversation with a message you haven't read", () => {
    renderAll([thread({ isUnreadForMe: true })]);
    expect(screen.getByText("Dinner plans").style.fontWeight).toBe("600");
    expect(screen.getByLabelText("Mark as read")).toBeTruthy();
  });
});
