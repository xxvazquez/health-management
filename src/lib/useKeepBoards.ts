"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { usePartnerLinked } from "@/lib/usePartnerLinked";
import {
  createPersonalNote,
  deletePersonalNote,
  fetchPersonalNotes,
  updatePersonalNote,
  type PersonalNote,
} from "@/lib/supabase/personalReminders";
import {
  createHouseholdCode,
  createHouseholdNote,
  deleteHouseholdCode,
  deleteHouseholdNote,
  fetchHouseholdCodes,
  fetchHouseholdNotes,
  updateHouseholdCode,
  updateHouseholdNote,
  type HouseholdCode,
  type HouseholdNote,
  type NewHouseholdCodeInput,
} from "@/lib/supabase/household";
import {
  createWishlistCategory,
  createWishlistItem,
  deleteWishlistCategory,
  deleteWishlistItem,
  fetchWishlist,
  updateWishlistCategory,
  updateWishlistItem,
  type NewWishlistItemInput,
  type WishlistCategory,
  type WishlistCategoryAppearance,
  type WishlistCategoryPatch,
} from "@/lib/supabase/wishlist";
import { getPartnerLink } from "@/lib/supabase/partner";
import { buildDemoPersonalNotes } from "@/lib/demoPersonalReminders";
import { buildDemoHouseholdCodes, DEMO_HOME_ME_ID, DEMO_HOME_PARTNER_ID } from "@/lib/demoHousehold";
import { buildDemoHouseholdNotes } from "@/lib/demoHousehold";
import { buildDemoWishlist } from "@/lib/demoWishlist";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** A note tagged with which table backs it — `mine` = `personal_notes`
 * (owner-only), `shared` = `household_notes` (visible to a linked partner).
 * "Share" / "Make private" move the row between the two; there is no
 * `is_shared` column. */
export type NoteScope = "mine" | "shared";
export interface ScopedNote {
  id: string;
  title: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  scope: NoteScope;
}

/** Survives navigation, keyed by user id — same pattern as the old
 * `homeCache` and `usePersonalReminderBoards`. */
let cache: {
  userId: string;
  mine: PersonalNote[];
  shared: HouseholdNote[];
  codes: HouseholdCode[];
  wishlist: WishlistCategory[];
} | null = null;

const KEEP_BOARDS_TABLES = ["personal_notes", "household_notes", "household_codes", "wishlist_categories", "wishlist_items"] as const;

interface KeepBoardsBundle {
  mine: PersonalNote[];
  shared: HouseholdNote[];
  codes: HouseholdCode[];
  wishlist: WishlistCategory[];
}

/**
 * All the state + handlers behind the Notes area's Quick notes / Wishlist /
 * Codes tabs (Journal keeps its own `JournalTab`). Quick notes merges the
 * private `personal_notes` and shared `household_notes` tables into one
 * scoped list; Wishlist and Codes are the shared (`household_*`,
 * pair-visible) tables that also work solo. Signed out shows interactive
 * example data that lives only in local state.
 */
export function useKeepBoards() {
  const { session, loading: authLoading } = useAuth();
  const accountId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const partnerLinked = usePartnerLinked();
  const myUserId = isDemo ? DEMO_HOME_ME_ID : accountId;
  const seed = cache && cache.userId === accountId ? cache : null;

  const [mine, setMine] = useState<PersonalNote[]>(() => seed?.mine ?? buildDemoPersonalNotes());
  const [shared, setShared] = useState<HouseholdNote[]>(() => seed?.shared ?? buildDemoHouseholdNotes());
  const [notesLoading, setNotesLoading] = useState(seed === null);
  const [notesError, setNotesError] = useState(false);

  const [codes, setCodes] = useState<HouseholdCode[]>(() => seed?.codes ?? buildDemoHouseholdCodes());
  const [codesLoading, setCodesLoading] = useState(seed === null);
  const [codesError, setCodesError] = useState(false);

  const [wishlist, setWishlist] = useState<WishlistCategory[]>(() => seed?.wishlist ?? buildDemoWishlist());
  const [wishlistLoading, setWishlistLoading] = useState(seed === null);
  const [wishlistError, setWishlistError] = useState(false);

  const [resolvedPartnerId, setResolvedPartnerId] = useState<string | null>(null);
  const partnerId = isDemo ? DEMO_HOME_PARTNER_ID : resolvedPartnerId;

  const notes: ScopedNote[] = useMemo(
    () => [
      ...mine.map((n) => ({ ...n, scope: "mine" as const })),
      ...shared.map((n) => ({ ...n, scope: "shared" as const })),
    ],
    [mine, shared],
  );

  const loadWishlist = useCallback(async () => {
    setWishlistError(false);
    try {
      setWishlist(await fetchWishlist());
    } catch (err) {
      console.error("fetchWishlist failed", err);
      setWishlistError(true);
    } finally {
      setWishlistLoading(false);
    }
  }, []);

  const { persist } = useSnapshotCache<KeepBoardsBundle>({
    feature: "keepBoards",
    tables: KEEP_BOARDS_TABLES,
    userId: accountId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => {
      const [p, h, c, w] = await Promise.all([fetchPersonalNotes(), fetchHouseholdNotes(), fetchHouseholdCodes(), fetchWishlist()]);
      return { mine: p, shared: h, codes: c, wishlist: w };
    },
    apply: ({ mine: p, shared: h, codes: c, wishlist: w }) => {
      setMine(p);
      setShared(h);
      setCodes(c);
      setWishlist(w);
      setNotesError(false);
      setCodesError(false);
      setWishlistError(false);
    },
    onSettled: () => {
      setNotesLoading(false);
      setCodesLoading(false);
      setWishlistLoading(false);
    },
    onError: () => {
      setNotesError(true);
      setCodesError(true);
      setWishlistError(true);
    },
  });

  useEffect(() => {
    if (isDemo || !accountId) return;
    getPartnerLink()
      .then((link) => setResolvedPartnerId(link?.partnerId ?? null))
      .catch((err) => console.error("getPartnerLink failed", err));
  }, [isDemo, accountId]);

  useEffect(() => {
    if (isDemo || !accountId) {
      cache = null;
      return;
    }
    if (!notesLoading && !codesLoading && !wishlistLoading) {
      cache = { userId: accountId, mine, shared, codes, wishlist };
      persist({ mine, shared, codes, wishlist });
    }
  }, [accountId, isDemo, mine, shared, codes, wishlist, notesLoading, codesLoading, wishlistLoading, persist]);

  // --- Quick notes ---
  const createNote = useCallback(
    async (title: string, body: string) => {
      if (isDemo) {
        const nowIso = new Date().toISOString();
        setMine((prev) => [{ id: `demo-${Date.now()}`, title: title.trim() || null, body: body.trim(), createdAt: nowIso, updatedAt: nowIso }, ...prev]);
        return;
      }
      const created = await createPersonalNote(title, body);
      setMine((prev) => [created, ...prev]);
    },
    [isDemo],
  );

  const updateNote = useCallback(
    async (id: string, title: string, body: string) => {
      const current = notes.find((n) => n.id === id);
      if (!current) return;
      if (isDemo) {
        const patch = { title: title.trim() || null, body: body.trim(), updatedAt: new Date().toISOString() };
        const apply = (prev: { id: string }[]) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n));
        if (current.scope === "mine") setMine((prev) => apply(prev) as PersonalNote[]);
        else setShared((prev) => apply(prev) as HouseholdNote[]);
        return;
      }
      if (current.scope === "mine") {
        const updated = await updatePersonalNote(current, title, body);
        setMine((prev) => prev.map((n) => (n.id === id ? updated : n)));
      } else {
        const updated = await updateHouseholdNote(current, title, body);
        setShared((prev) => prev.map((n) => (n.id === id ? updated : n)));
      }
    },
    [isDemo, notes],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const current = notes.find((n) => n.id === id);
      if (!current) return;
      if (current.scope === "mine") {
        setMine((prev) => prev.filter((n) => n.id !== id));
        if (!isDemo) await deletePersonalNote(id);
      } else {
        setShared((prev) => prev.filter((n) => n.id !== id));
        if (!isDemo) await deleteHouseholdNote(id);
      }
    },
    [isDemo, notes],
  );

  const shareNote = useCallback(
    async (id: string) => {
      const current = mine.find((n) => n.id === id);
      if (!current) return;
      if (isDemo) {
        setMine((prev) => prev.filter((n) => n.id !== id));
        setShared((prev) => [{ ...current }, ...prev]);
        return;
      }
      const created = await createHouseholdNote(current.title ?? "", current.body);
      await deletePersonalNote(id);
      setMine((prev) => prev.filter((n) => n.id !== id));
      setShared((prev) => [created, ...prev]);
    },
    [isDemo, mine],
  );

  const unshareNote = useCallback(
    async (id: string) => {
      const current = shared.find((n) => n.id === id);
      if (!current) return;
      if (isDemo) {
        setShared((prev) => prev.filter((n) => n.id !== id));
        setMine((prev) => [{ ...current }, ...prev]);
        return;
      }
      const created = await createPersonalNote(current.title ?? "", current.body);
      await deleteHouseholdNote(id);
      setShared((prev) => prev.filter((n) => n.id !== id));
      setMine((prev) => [created, ...prev]);
    },
    [isDemo, shared],
  );

  // --- Codes ---
  const createCode = useCallback(
    async (input: NewHouseholdCodeInput) => {
      if (isDemo) {
        const nowIso = new Date().toISOString();
        setCodes((prev) => [
          {
            id: `demo-${Date.now()}`,
            code: input.code.trim(),
            name: input.name.trim(),
            comment: input.comment.trim() || null,
            expiresOn: input.expiresOn,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...prev,
        ]);
        return;
      }
      const created = await createHouseholdCode(input);
      setCodes((prev) => [created, ...prev]);
    },
    [isDemo],
  );

  const editCode = useCallback(
    async (id: string, input: NewHouseholdCodeInput) => {
      if (isDemo) {
        setCodes((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, code: input.code.trim(), name: input.name.trim(), comment: input.comment.trim() || null, expiresOn: input.expiresOn, updatedAt: new Date().toISOString() }
              : c,
          ),
        );
        return;
      }
      const current = codes.find((c) => c.id === id);
      if (!current) return;
      const updated = await updateHouseholdCode(current, input);
      setCodes((prev) => prev.map((c) => (c.id === id ? updated : c)));
    },
    [isDemo, codes],
  );

  const deleteCode = useCallback(
    async (id: string) => {
      setCodes((prev) => prev.filter((c) => c.id !== id));
      if (!isDemo) await deleteHouseholdCode(id);
    },
    [isDemo],
  );

  // --- Wishlist ---
  const createCategory = useCallback(
    async (name: string, appearance?: WishlistCategoryAppearance): Promise<WishlistCategory> => {
      if (isDemo) {
        const category: WishlistCategory = {
          id: `demo-${Date.now()}`,
          name: name.trim(),
          icon: appearance?.icon ?? null,
          color: appearance?.color ?? null,
          createdAt: new Date().toISOString(),
          items: [],
        };
        setWishlist((prev) => [...prev, category]);
        return category;
      }
      const created = await createWishlistCategory(name, appearance);
      setWishlist((prev) => [...prev, created]);
      return created;
    },
    [isDemo],
  );

  const updateCategory = useCallback(
    async (id: string, patch: WishlistCategoryPatch) => {
      const current = wishlist.find((c) => c.id === id);
      setWishlist((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
                ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
                ...(patch.color !== undefined ? { color: patch.color } : {}),
              }
            : c,
        ),
      );
      if (!isDemo && current) await updateWishlistCategory(current, patch);
    },
    [isDemo, wishlist],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      setWishlist((prev) => prev.filter((c) => c.id !== id));
      if (!isDemo) await deleteWishlistCategory(id);
    },
    [isDemo],
  );

  const createItem = useCallback(
    async (input: NewWishlistItemInput) => {
      if (isDemo) {
        setWishlist((prev) =>
          prev.map((c) =>
            c.id === input.categoryId
              ? {
                  ...c,
                  items: [
                    {
                      id: `demo-${Date.now()}`,
                      categoryId: c.id,
                      url: input.url.trim(),
                      title: input.title.trim(),
                      note: input.note.trim() || null,
                      forUserId: input.forUserId,
                      createdAt: new Date().toISOString(),
                    },
                    ...c.items,
                  ],
                }
              : c,
          ),
        );
        return;
      }
      const created = await createWishlistItem(input);
      setWishlist((prev) => prev.map((c) => (c.id === created.categoryId ? { ...c, items: [created, ...c.items] } : c)));
    },
    [isDemo],
  );

  const updateItem = useCallback(
    async (id: string, input: NewWishlistItemInput) => {
      if (isDemo) {
        setWishlist((prev) =>
          prev.map((c) => {
            const withoutItem = c.items.filter((i) => i.id !== id);
            if (c.id === input.categoryId) {
              return {
                ...c,
                items: [
                  {
                    id,
                    categoryId: c.id,
                    url: input.url.trim(),
                    title: input.title.trim(),
                    note: input.note.trim() || null,
                    forUserId: input.forUserId,
                    createdAt: new Date().toISOString(),
                  },
                  ...withoutItem,
                ],
              };
            }
            return { ...c, items: withoutItem };
          }),
        );
        return;
      }
      const current = wishlist.flatMap((c) => c.items).find((i) => i.id === id);
      if (!current) return;
      const updated = await updateWishlistItem(current, input);
      setWishlist((prev) =>
        prev.map((c) => {
          const without = c.items.filter((i) => i.id !== id);
          return c.id === updated.categoryId ? { ...c, items: [updated, ...without] } : { ...c, items: without };
        }),
      );
    },
    [isDemo, wishlist],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      setWishlist((prev) => prev.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== id) })));
      if (!isDemo) await deleteWishlistItem(id);
    },
    [isDemo],
  );

  return {
    isDemo,
    myUserId,
    partnerId,
    partnerLinked,
    notes: {
      data: notes,
      loading: notesLoading,
      error: notesError,
      create: createNote,
      update: updateNote,
      remove: deleteNote,
      share: shareNote,
      unshare: unshareNote,
    },
    codes: { data: codes, loading: codesLoading, error: codesError, create: createCode, edit: editCode, remove: deleteCode },
    wishlist: {
      data: wishlist,
      loading: wishlistLoading,
      error: wishlistError,
      refresh: loadWishlist,
      createCategory,
      updateCategory,
      deleteCategory,
      createItem,
      updateItem,
      deleteItem,
    },
  };
}
