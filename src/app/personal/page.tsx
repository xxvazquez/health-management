"use client";

import { useEffect, useState } from "react";
import { useKeepBoards } from "@/lib/useKeepBoards";
import {
  deleteMyShareToken,
  fetchLinkMetadata,
  fetchMyShareToken,
  regenerateMyShareToken,
  wishlistShareAuthHeader,
  wishlistShareEndpoint,
} from "@/lib/supabase/wishlist";
import { JournalTab } from "@/components/log/JournalTab";
import { NoteBoard } from "@/components/reminders/NoteBoard";
import { CodeBoard } from "@/components/home/CodeBoard";
import { WishlistBoard } from "@/components/home/WishlistBoard";
import { BoardPage, type BoardPageTab } from "@/components/ui/BoardPage";
import { DemoNotice } from "@/components/ui/DemoNotice";

// One hue for the whole Notes section (h1 rule, tab bar, every tab's add
// button) — its tabs aren't colour-coded concepts, so recolouring per tab
// just made moving between them feel like four apps.
const NOTES_ACCENT = "var(--series-indigo)";

type NotesTab = "journal" | "quicknotes" | "wishlist" | "codes";
const TABS: BoardPageTab[] = [
  { id: "journal", label: "Journal", icon: "journal", accent: NOTES_ACCENT },
  { id: "quicknotes", label: "Quick notes", icon: "notes", accent: NOTES_ACCENT },
  { id: "wishlist", label: "Wishlist", icon: "wishlist", accent: NOTES_ACCENT },
  { id: "codes", label: "Codes", icon: "codes", accent: NOTES_ACCENT },
];

const TAB_STORAGE_KEY = "lauva-notes-tab";

function isNotesTab(v: string): v is NotesTab {
  return TABS.some((t) => t.id === v);
}

/** The shared `url` param is the clean case; many apps (and iOS Safari)
 * instead drop the link into `text`, sometimes prefixed with a title — so
 * fall back to the first http(s) URL found there. */
function extractSharedUrl(url: string | null, text: string | null): string | null {
  if (url && /^https?:\/\//i.test(url.trim())) return url.trim();
  const match = text?.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

/** The Notes area — the things you keep with no deadline. Journal and Quick
 * notes are private writing (Quick notes can be shared with a linked
 * partner per-note); Wishlist and Codes are shared lists that also work
 * solo. Reminders and product-expiry live on Agenda, organised by *when*.
 * Absorbs the old Household page (`/home` redirects here). */
export default function NotesPage() {
  const keep = useKeepBoards();
  const [tab, setTab] = useState<NotesTab>("journal");
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);

  useEffect(() => {
    // External read on mount (URL + localStorage), not a state-sync loop.
    /* eslint-disable react-hooks/set-state-in-effect */
    const params = new URLSearchParams(window.location.search);
    const shared = extractSharedUrl(params.get("url"), params.get("text"));
    if (shared) {
      setSharedUrl(shared);
      setTab("wishlist");
      window.history.replaceState(null, "", `${window.location.pathname}#wishlist`);
      return;
    }
    const hash = window.location.hash.replace("#", "");
    if (isNotesTab(hash)) {
      setTab(hash);
      return;
    }
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved && isNotesTab(saved)) setTab(saved);
    } catch {
      // Storage blocked — just stay on the default.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#", "");
      if (isNotesTab(id)) setTab(id);
    };
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function selectTab(id: NotesTab) {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, id);
    } catch {
      // Storage blocked — the tab still switches for this session.
    }
  }

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const completedByLabel = (userId: string) => (userId === keep.myUserId ? "you" : "your partner");

  return (
    <BoardPage
      title="Notes"
      accent={active.accent}
      tabs={TABS}
      activeTab={active.id}
      onSelectTab={(id) => selectTab(id as NotesTab)}
      notice={keep.isDemo && tab !== "journal" ? <DemoNotice /> : undefined}
    >
      {tab === "journal" && <JournalTab isDemoData={keep.isDemo} accent={NOTES_ACCENT} />}

      {tab === "quicknotes" && (
        <NoteBoard
          notes={keep.notes.data}
          loading={!keep.isDemo && keep.notes.loading}
          error={keep.notes.error}
          accent={NOTES_ACCENT}
          partnerLinked={keep.partnerLinked}
          emptyDescription="Tap New note to jot something down — a code, a measurement, anything."
          onCreate={keep.notes.create}
          onUpdate={keep.notes.update}
          onDelete={keep.notes.remove}
          onShare={keep.notes.share}
          onUnshare={keep.notes.unshare}
        />
      )}

      {tab === "wishlist" && (
        <div className="max-w-4xl">
          <WishlistBoard
            categories={keep.wishlist.data}
            loading={!keep.isDemo && keep.wishlist.loading}
            error={keep.wishlist.error}
            accent={NOTES_ACCENT}
            people={keep.myUserId ? { myUserId: keep.myUserId, partnerId: keep.partnerId } : undefined}
            forLabel={completedByLabel}
            sharedUrl={sharedUrl}
            onSharedUrlConsumed={() => setSharedUrl(null)}
            onRefresh={keep.isDemo ? undefined : keep.wishlist.refresh}
            shareToPhone={
              !keep.isDemo && wishlistShareEndpoint() && wishlistShareAuthHeader()
                ? {
                    endpoint: wishlistShareEndpoint() as string,
                    authHeader: wishlistShareAuthHeader() as string,
                    getToken: fetchMyShareToken,
                    regenerate: regenerateMyShareToken,
                    disable: deleteMyShareToken,
                  }
                : undefined
            }
            onFetchTitle={keep.isDemo ? undefined : (url) => fetchLinkMetadata(url).then((r) => r.title)}
            onCreateCategory={keep.wishlist.createCategory}
            onUpdateCategory={keep.wishlist.updateCategory}
            onDeleteCategory={keep.wishlist.deleteCategory}
            onCreateItem={keep.wishlist.createItem}
            onUpdateItem={keep.wishlist.updateItem}
            onDeleteItem={keep.wishlist.deleteItem}
          />
        </div>
      )}

      {tab === "codes" && (
        <CodeBoard
          codes={keep.codes.data}
          loading={!keep.isDemo && keep.codes.loading}
          error={keep.codes.error}
          accent={NOTES_ACCENT}
          onCreate={keep.codes.create}
          onEdit={keep.codes.edit}
          onDelete={keep.codes.remove}
        />
      )}
    </BoardPage>
  );
}
