// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NoteThreadView } from "./NoteThreadView";
import type { NoteMessage, NoteThread } from "@/lib/supabase/notes";

afterEach(() => {
  cleanup();
});

const noop = async () => {};

const thread: NoteThread = {
  id: "root",
  senderId: "partner",
  recipientId: "me",
  category: "note",
  subject: "Dinner",
  body: "Pasta tonight?",
  createdAt: "2026-09-20T18:00:00.000Z",
  lastMessageAt: "2026-09-20T18:05:00.000Z",
  isUnreadForMe: false,
  isSeenByPartner: true,
  partnerReadAt: null,
  isFavouritedByMe: false,
  isMine: false,
};

const messages: NoteMessage[] = [
  { id: "root", senderId: "partner", isMine: false, body: "Pasta tonight?", createdAt: "2026-09-20T18:00:00.000Z", replyToId: null },
  { id: "r1", senderId: "me", isMine: true, body: "Yes please", createdAt: "2026-09-20T18:05:00.000Z", replyToId: "root" },
];

function renderThread(onReply = vi.fn(async (_root: string, _to: string, body: string, replyToId?: string | null) => ({ ...messages[1], id: "r2", body, replyToId: replyToId ?? null }))) {
  render(
    <NoteThreadView
      thread={thread}
      partnerLabel="Sam"
      onBack={() => {}}
      onChanged={() => {}}
      fetchMessages={async () => messages}
      onMarkRead={noop}
      onMarkUnread={noop}
      onToggleFavourite={noop}
      onDelete={noop}
      onReply={onReply}
      onRemind={async () => true}
    />,
  );
  return onReply;
}

describe("NoteThreadView replies", () => {
  it("shows the quoted message inside a reply", async () => {
    renderThread();
    await waitFor(() => expect(screen.getByText("Yes please")).toBeTruthy());
    expect(screen.getAllByText("Pasta tonight?")).toHaveLength(2);
    expect(screen.getByText("Sam")).toBeTruthy();
  });

  it("replies quoting a message picked from its menu", async () => {
    const onReply = renderThread();
    await waitFor(() => expect(screen.getByText("Yes please")).toBeTruthy());
    fireEvent.contextMenu(screen.getAllByText("Pasta tonight?")[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Reply" }));
    expect(screen.getByText("Replying to Sam")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reply to Sam"), { target: { value: "See you at 7" } });
    fireEvent.submit(screen.getByLabelText("Reply to Sam").closest("form")!);
    await waitFor(() => expect(onReply).toHaveBeenCalledWith("root", "partner", "See you at 7", "root"));
    await waitFor(() => expect(screen.queryByText("Replying to Sam")).toBeNull());
  });
});
