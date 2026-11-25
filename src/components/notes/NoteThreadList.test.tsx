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
  it("shows the latest message with its type, leaving General unlabelled", () => {
    renderAll([thread({ category: "appreciation", lastMessage: "See you at 7" }), thread({ id: "t2", senderId: "partner", recipientId: "me", isMine: false })]);
    expect(screen.getByText("See you at 7")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Appreciation" })).toBeTruthy();
    expect(screen.getByText("Pasta tonight?")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "General" })).toBeNull();
    expect(screen.queryByText("Dinner plans")).toBeNull();
  });

  it("keeps read status out of the row", () => {
    renderAll([thread({}), thread({ id: "t2", isSeenByPartner: true })]);
    expect(screen.queryByText("Not read yet")).toBeNull();
    expect(screen.queryByText("Read")).toBeNull();
  });

  it("shows a read conversation in plain weight", () => {
    renderAll([thread({})]);
    expect(screen.getByText("Pasta tonight?").style.fontWeight).toBe("400");
    expect(screen.getByLabelText("Mark as unread")).toBeTruthy();
  });

  it("marks a conversation with a message you haven't read", () => {
    renderAll([thread({ isUnreadForMe: true })]);
    expect(screen.getByText("Pasta tonight?").style.fontWeight).toBe("600");
    expect(screen.getByLabelText("Mark as read")).toBeTruthy();
  });

  it("stars a favourite", () => {
    renderAll([thread({ isFavourite: true })]);
    expect(screen.getByRole("img", { name: "Favourite" })).toBeTruthy();
  });
});
