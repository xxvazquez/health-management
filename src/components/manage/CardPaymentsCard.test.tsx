// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardPaymentsCard } from "./ExpensesCards";

const regenerate = vi.fn(async () => ({ token: "new-key", createdAt: "", lastUsedAt: null }));
vi.mock("@/lib/supabase/phoneTokens", () => ({
  fetchPhoneToken: async () => ({ token: "old-key", createdAt: "", lastUsedAt: null }),
  regeneratePhoneToken: () => regenerate(),
  deletePhoneToken: vi.fn(),
  functionEndpoint: () => "https://example.test/functions/v1/expense-import",
  functionAuthHeader: () => "Bearer anon",
}));

afterEach(cleanup);

describe("CardPaymentsCard", () => {
  it("asks before making a new key, then shows the new link", async () => {
    render(<CardPaymentsCard isDemoData={false} searchQuery="card" />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New key" }));
    expect(regenerate).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "New key" }));
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("https://example.test/functions/v1/expense-import?token=new-key")).toBeInTheDocument();
  });

  it("keeps the old key when cancelled", async () => {
    regenerate.mockClear();
    render(<CardPaymentsCard isDemoData={false} searchQuery="card" />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New key" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(regenerate).not.toHaveBeenCalled();
  });
});
