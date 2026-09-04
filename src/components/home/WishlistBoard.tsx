"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";
import { SearchField } from "@/components/ui/SearchField";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { FIELD_CLS, FIELD_STYLE } from "@/components/ui/formField";
import type {
  NewWishlistItemInput,
  WishlistCategory,
  WishlistCategoryAppearance,
  WishlistCategoryPatch,
  WishlistItem,
  WishlistShareToken,
} from "@/lib/supabase/wishlist";
import {
  WishlistCategoryIcon,
  WISHLIST_COLOR_CHOICES,
  WISHLIST_ICON_KEYS,
  wishlistColorValue,
} from "./wishlistIcons";

/** Fallback per-category accent, keyed off the category's position in the
 * (oldest-first) list — see fetchWishlist. Used when the category has no
 * colour of its own. */
const WISHLIST_ACCENTS = WISHLIST_COLOR_CHOICES.map((c) => c.value);

/** A category's own colour if it set one, else the position fallback. */
function accentForCategory(category: WishlistCategory, index: number): string {
  return wishlistColorValue(category.color) ?? WISHLIST_ACCENTS[index % WISHLIST_ACCENTS.length];
}

/** Prepend a scheme so a pasted "example.com/thing" is still a working
 * link and a parseable URL. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(normalizeUrl(url)).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const NEW_CATEGORY = "__new__";
const FOR_ANYONE = "";

export interface WishlistPeople {
  myUserId: string;
  partnerId: string | null;
}

/** iOS-list-app flourish: the list's icon in its colour, carried in a soft
 * rounded square, so a wall of categories reads at a glance. */
function CategoryGlyph({ accent, icon = null, size = 34 }: { accent: string; icon?: string | null; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[9px]"
      style={{ width: size, height: size, background: `color-mix(in oklab, ${accent} 16%, var(--surface-1))`, color: accent }}
    >
      <WishlistCategoryIcon icon={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

function ItemForm({
  categories,
  accent,
  initial,
  presetCategoryId,
  presetUrl,
  people,
  onFetchTitle,
  onSave,
  onCancel,
}: {
  categories: WishlistCategory[];
  accent: string;
  initial?: WishlistItem;
  presetCategoryId?: string;
  presetUrl?: string;
  people?: WishlistPeople;
  onFetchTitle?: (url: string) => Promise<string | null>;
  onSave: (input: NewWishlistItemInput, newCategoryName: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? presetUrl ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? presetCategoryId ?? categories[0]?.id ?? NEW_CATEGORY,
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [forUserId, setForUserId] = useState(initial?.forUserId ?? FOR_ANYONE);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsNewCategory = categoryId === NEW_CATEGORY || categories.length === 0;
  const canSave =
    url.trim().length > 0 &&
    title.trim().length > 0 &&
    (!needsNewCategory || newCategoryName.trim().length > 0);

  async function lookUpTitle() {
    if (!onFetchTitle || !url.trim() || title.trim() || fetching) return;
    setFetching(true);
    try {
      const fetched = await onFetchTitle(normalizeUrl(url));
      if (fetched) setTitle(fetched);
    } finally {
      setFetching(false);
    }
  }

  // Shared in from another app with the URL already filled — look its
  // title up straight away (a one-shot external fetch on mount), since
  // there's no blur event to wait for.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (presetUrl && !initial) void lookUpTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(
        {
          categoryId: needsNewCategory ? "" : categoryId,
          url: normalizeUrl(url),
          title,
          note,
          forUserId: forUserId || null,
        },
        needsNewCategory ? newCategoryName : null,
      );
    } catch (err) {
      console.error("wishlist item save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Link
        <input
          autoFocus
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={lookUpTitle}
          placeholder="https://…"
          inputMode="url"
          maxLength={2000}
          className={FIELD_CLS}
          style={FIELD_STYLE}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-2">
          Title
          {fetching && <span style={{ color: "var(--text-muted)" }}>· fetching…</span>}
        </span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is it?"
          maxLength={200}
          className={`${FIELD_CLS} font-medium`}
          style={FIELD_STYLE}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Note (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Size, colour, who it's for, why…"
          rows={2}
          maxLength={500}
          className={`${FIELD_CLS} resize-y`}
          style={FIELD_STYLE}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Category
          {categories.length > 0 && (
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>＋ New category…</option>
            </select>
          )}
          {needsNewCategory && (
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              maxLength={80}
              className={`${FIELD_CLS} ${categories.length > 0 ? "mt-1" : ""}`}
              style={FIELD_STYLE}
            />
          )}
        </label>

        {people && (
          <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            For
            <select value={forUserId} onChange={(e) => setForUserId(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE}>
              <option value={FOR_ANYONE}>Either of you</option>
              <option value={people.myUserId}>Me</option>
              {people.partnerId && <option value={people.partnerId}>Partner</option>}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!canSave || saving} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add to wishlist"}
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

interface CategoryFormValues {
  name: string;
  icon: string | null;
  color: string | null;
}

function CategoryForm({
  fallbackAccent,
  initial,
  onSave,
  onCancel,
}: {
  fallbackAccent: string;
  initial?: WishlistCategory;
  onSave: (values: CategoryFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = wishlistColorValue(color) ?? fallbackAccent;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name, icon, color });
    } catch (err) {
      console.error("wishlist category save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <div className="flex items-center gap-3">
        <CategoryGlyph accent={accent} icon={icon} size={40} />
        <input
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="List name"
          maxLength={80}
          className={`${FIELD_CLS} min-w-0 flex-1 font-medium`}
          style={FIELD_STYLE}
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Icon
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {WISHLIST_ICON_KEYS.map((key) => {
            const selected = (icon ?? "heart") === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                aria-label={key}
                onClick={() => setIcon(key === "heart" ? null : key)}
                className="tap-target flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
                style={{
                  borderColor: selected ? accent : "var(--border-hairline)",
                  background: selected ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "var(--surface-1)",
                  color: selected ? accent : "var(--text-muted)",
                }}
              >
                <WishlistCategoryIcon icon={key} size={17} />
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Colour
        </legend>
        <div className="flex flex-wrap gap-2">
          {WISHLIST_COLOR_CHOICES.map((choice) => {
            const selected = color === choice.key;
            return (
              <button
                key={choice.key}
                type="button"
                aria-pressed={selected}
                aria-label={choice.key}
                onClick={() => setColor(selected ? null : choice.key)}
                className="tap-target flex h-7 w-7 items-center justify-center rounded-full"
                style={{ boxShadow: selected ? `0 0 0 2px var(--surface-1), 0 0 0 4px ${choice.value}` : "none" }}
              >
                <span className="h-5 w-5 rounded-full" style={{ background: choice.value }} />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!name.trim() || saving} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add list"}
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

/** One row in a category's item list. */
function ItemRow({
  item,
  accent,
  forLabel,
  onEdit,
  onDelete,
}: {
  item: WishlistItem;
  accent: string;
  forLabel?: (userId: string) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const host = hostFromUrl(item.url);

  return (
    <div className="flex items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <a
          href={normalizeUrl(item.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium underline decoration-transparent underline-offset-2 transition-colors hover:decoration-inherit"
          style={{ color: "var(--text-primary)" }}
        >
          {item.title}
        </a>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {host && (
            <span className="truncate" style={{ color: accent }}>
              {host}
            </span>
          )}
          {item.forUserId && forLabel && (
            <span
              className="rounded px-1.5 py-0.5 text-xs font-medium"
              style={{ background: `color-mix(in oklab, ${accent} 12%, transparent)`, color: accent }}
            >
              For {forLabel(item.forUserId)}
            </span>
          )}
        </span>
        {item.note && (
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            {item.note}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {confirmingDelete ? (
          <>
            <button type="button" onClick={onDelete} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
              Remove
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-md px-2 py-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${item.title}`}
              title="Edit"
              className="tap-target rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
              style={{ color: "var(--text-muted)" }}
            >
              <PencilIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Remove ${item.title}`}
              title="Remove"
              className="tap-target notebook-danger rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
              style={{ color: "var(--text-muted)" }}
            >
              <TrashIcon size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Top-level list: one tappable row per category, iOS-list style — colour
 * glyph, name, a short preview of what's inside, item count, chevron. */
function CategoryRow({
  category,
  accent,
  onOpen,
}: {
  category: WishlistCategory;
  accent: string;
  onOpen: () => void;
}) {
  const preview = category.items.slice(0, 3).map((i) => i.title).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-[var(--page-plane)]"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <CategoryGlyph accent={accent} icon={category.icon} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {category.name}
        </span>
        <span className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
          {category.items.length === 0 ? "Empty" : preview}
        </span>
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>
        {category.items.length}
      </span>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true">
        <path d="M7.5 5 12.5 10 7.5 15" />
      </svg>
    </button>
  );
}

/** One category opened full-width: back to the list, the category's own
 * items, rename/delete, and adding links straight into it. */
function CategoryDetail({
  category,
  accent,
  forLabel,
  onBack,
  onAddItem,
  onRename,
  onDelete,
  onEditItem,
  onDeleteItem,
}: {
  category: WishlistCategory;
  accent: string;
  forLabel?: (userId: string) => string;
  onBack: () => void;
  onAddItem: () => void;
  onRename: () => void;
  onDelete: () => void;
  onEditItem: (item: WishlistItem) => void;
  onDeleteItem: (id: string) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12.5 5 7.5 10 12.5 15" />
        </svg>
        All lists
      </button>

      <div className="flex items-center gap-3">
        <CategoryGlyph accent={accent} icon={category.icon} size={38} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {category.name}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {confirmingDelete ? (
            <>
              <button type="button" onClick={onDelete} className="text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
                Delete{category.items.length > 0 ? ` (${category.items.length})` : ""}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onRename}
                aria-label={`Rename ${category.name}`}
                title="Rename list"
                className="tap-target rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
                style={{ color: "var(--text-muted)" }}
              >
                <PencilIcon size={15} />
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label={`Delete ${category.name}`}
                title="Delete list"
                className="tap-target notebook-danger rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
                style={{ color: "var(--text-muted)" }}
              >
                <TrashIcon size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col rounded-xl border px-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        {category.items.length === 0 ? (
          <p className="py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing here yet — add the first link below.
          </p>
        ) : (
          category.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              accent={accent}
              forLabel={forLabel}
              onEdit={() => onEditItem(item)}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))
        )}
      </div>

      <button
        type="button"
        onClick={onAddItem}
        className="self-start rounded-md px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ background: accent }}
      >
        + Add link
      </button>
    </div>
  );
}

/** Everything the "Add from your phone" panel needs. Absent in demo mode
 * and when cloud sync isn't configured — a token authenticates one real
 * account, so there's nothing to show. */
export interface WishlistShareToPhone {
  endpoint: string;
  authHeader: string;
  getToken: () => Promise<WishlistShareToken | null>;
  regenerate: () => Promise<WishlistShareToken>;
  disable: () => Promise<void>;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 text-xs"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard blocked — the value stays visible to select by hand.
            }
          }}
          className="tap-target shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** iOS has no PWA share target, so a link gets into the wishlist from a
 * phone via a Shortcut that POSTs to the wishlist-share Edge Function,
 * standing in for a session with a per-account token. Android already has
 * the PWA share target and needs none of this. */
function PhoneSetup({ share, accent, onBack }: { share: WishlistShareToPhone; accent: string; onBack: () => void }) {
  const [token, setToken] = useState<WishlistShareToken | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "working">("loading");

  useEffect(() => {
    let active = true;
    share
      .getToken()
      .then((t) => {
        if (active) {
          setToken(t);
          setState("ready");
        }
      })
      .catch(() => {
        if (active) setState("ready");
      });
    return () => {
      active = false;
    };
  }, [share]);

  const act = async (fn: () => Promise<WishlistShareToken | null>) => {
    setState("working");
    try {
      setToken(await fn());
    } catch (err) {
      console.error("wishlist share token action failed", err);
    } finally {
      setState("ready");
    }
  };

  const busy = state !== "ready";
  const keyedEndpoint = token ? `${share.endpoint}?token=${encodeURIComponent(token.token)}&for=either` : "";
  const curl =
    keyedEndpoint && `curl -X POST '${keyedEndpoint}&url=https://example.com' -H 'Authorization: ${share.authHeader}'`;

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12.5 5 7.5 10 12.5 15" />
        </svg>
        All lists
      </button>

      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Add from your phone
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>Android:</strong> open a link, tap Share, choose Lauva — it opens the add-item form. Nothing to set up.
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>iPhone</strong> has no share target, so build this one-time Shortcut. It then works from Safari, Chrome or
          any app with a Share button.
        </p>
      </div>

      {state === "loading" ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : !token ? (
        <button
          type="button"
          onClick={() => act(share.regenerate)}
          disabled={busy}
          className="self-start rounded-md px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: accent }}
        >
          Create a phone key
        </button>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--page-plane)" }}>
            <CopyRow label="Endpoint — has your key, keep private" value={keyedEndpoint} />
            <CopyRow label="Header — Authorization" value={share.authHeader} />
          </div>

          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>
              iPhone Shortcut (iOS 18–26)
            </p>
            <ol className="mt-1 list-decimal space-y-2 pl-5">
              <li>
                <strong>Shortcuts</strong> app → <strong>+</strong> (top right) → tap the name, rename it{" "}
                <strong>Save to Lauva</strong>.
              </li>
              <li>
                Tap the <strong>ⓘ</strong> in the bottom toolbar → turn on <strong>Show in Share Sheet</strong>. A “Receive …
                from Share Sheet” bar appears at the top — tap its blue type and leave only <strong>URLs</strong> on.
              </li>
              <li>
                In <strong>Search Actions</strong>, add <strong>Get Contents of URL</strong>.
              </li>
              <li>
                Tap the blue <code>URL</code> → paste the <strong>Endpoint</strong> above, then type <code>&url=</code> right
                after it and tap <strong>Shortcut Input</strong> in the strip above the keyboard so a blue token lands at the
                very end. (URL field, not the body — variables always take here.)
              </li>
              <li>
                Tap the small <strong>⌄</strong> → set <strong>Method</strong> to <strong>POST</strong>, then{" "}
                <strong>Headers</strong> → <strong>Add new header</strong> → <code>Authorization</code> = the string above.
                Leave Request Body empty.
              </li>
              <li>Tap <strong>‹</strong> (top left) to save.</li>
            </ol>
            <p className="mt-2" style={{ color: "var(--text-muted)" }}>
              Use it: any browser → <strong>Share</strong> → <strong>Save to Lauva</strong>. Links land in a “Saved from
              phone” list. For a wish that’s for your partner, change <code>for=either</code> to <code>for=partner</code> in
              the endpoint; Andrzej can set the shortcut up from his own account too.
            </p>
          </div>

          {curl && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Test it from a computer
              </span>
              <div className="flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 text-xs"
                  style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
                >
                  {curl}
                </code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(curl).catch(() => {})}
                  className="tap-target shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium"
                  style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => act(share.regenerate)}
              disabled={busy}
              className="text-xs font-medium disabled:opacity-50"
              style={{ color: "var(--text-secondary)" }}
            >
              Regenerate key
            </button>
            <button
              type="button"
              onClick={() => act(() => share.disable().then(() => null))}
              disabled={busy}
              className="text-xs font-medium disabled:opacity-50"
              style={{ color: "var(--status-critical)" }}
            >
              Turn off
            </button>
          </div>
        </>
      )}
    </div>
  );
}

type View =
  | { mode: "list" }
  | { mode: "phone" }
  | { mode: "detail"; categoryId: string }
  | { mode: "item"; categoryId?: string; editing?: WishlistItem; presetUrl?: string; returnTo: "list" | "detail" }
  | { mode: "category"; editing?: WishlistCategory; returnTo: "list" | "detail" };

export function WishlistBoard({
  categories,
  loading,
  error,
  accent,
  people,
  forLabel,
  sharedUrl,
  onSharedUrlConsumed,
  shareToPhone,
  onRefresh,
  onFetchTitle,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
}: {
  categories: WishlistCategory[];
  loading: boolean;
  error: boolean;
  accent: string;
  people?: WishlistPeople;
  forLabel?: (userId: string) => string;
  /** A URL shared into the app; opens the new-item form pre-filled, once. */
  sharedUrl?: string | null;
  onSharedUrlConsumed?: () => void;
  /** Present only for a signed-in user on a cloud deployment. */
  shareToPhone?: WishlistShareToPhone;
  /** Re-pulls the wishlist — for links added from a phone shortcut while the app was open. */
  onRefresh?: () => Promise<void> | void;
  onFetchTitle?: (url: string) => Promise<string | null>;
  onCreateCategory: (name: string, appearance?: WishlistCategoryAppearance) => Promise<WishlistCategory>;
  onUpdateCategory: (id: string, patch: WishlistCategoryPatch) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onCreateItem: (input: NewWishlistItemInput) => Promise<void>;
  onUpdateItem: (id: string, input: NewWishlistItemInput) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>({ mode: "list" });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // A URL shared into the app — jump straight to the new-item form with it
  // pre-filled, then tell the parent it's been handled so a re-render or
  // the form's Cancel doesn't reopen it.
  useEffect(() => {
    if (!sharedUrl) return;
    // Opening a form in response to an external event, not a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView({ mode: "item", presetUrl: sharedUrl, returnTo: "list" });
    onSharedUrlConsumed?.();
  }, [sharedUrl, onSharedUrlConsumed]);

  const accentByCategoryId = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c, i) => map.set(c.id, accentForCategory(c, i)));
    return map;
  }, [categories]);

  const openCategory = (id: string): WishlistCategory | null => categories.find((c) => c.id === id) ?? null;

  const shownCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.items.some(
          (i) => i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q) || (i.note ?? "").toLowerCase().includes(q),
        ),
    );
  }, [categories, search]);

  if (view.mode === "item") {
    const back = () => setView(view.returnTo === "detail" && view.categoryId ? { mode: "detail", categoryId: view.categoryId } : { mode: "list" });
    return (
      <ItemForm
        categories={categories}
        accent={view.categoryId ? accentByCategoryId.get(view.categoryId) ?? accent : accent}
        initial={view.editing}
        presetCategoryId={view.categoryId}
        presetUrl={view.presetUrl}
        people={people}
        onFetchTitle={onFetchTitle}
        onSave={async (input, newCategoryName) => {
          let categoryId = input.categoryId;
          if (newCategoryName) categoryId = (await onCreateCategory(newCategoryName)).id;
          const finalInput = { ...input, categoryId };
          if (view.editing) await onUpdateItem(view.editing.id, finalInput);
          else await onCreateItem(finalInput);
          setView(view.returnTo === "detail" ? { mode: "detail", categoryId } : { mode: "list" });
        }}
        onCancel={back}
      />
    );
  }

  if (view.mode === "phone" && shareToPhone) {
    return <PhoneSetup share={shareToPhone} accent={accent} onBack={() => setView({ mode: "list" })} />;
  }

  if (view.mode === "category") {
    const back = () =>
      setView(view.returnTo === "detail" && view.editing ? { mode: "detail", categoryId: view.editing.id } : { mode: "list" });
    const editing = view.editing;
    return (
      <CategoryForm
        fallbackAccent={accent}
        initial={editing}
        onSave={async ({ name, icon, color }) => {
          if (editing) {
            await onUpdateCategory(editing.id, { name, icon, color });
            setView(view.returnTo === "detail" ? { mode: "detail", categoryId: editing.id } : { mode: "list" });
          } else {
            const created = await onCreateCategory(name, { icon, color });
            setView({ mode: "detail", categoryId: created.id });
          }
        }}
        onCancel={back}
      />
    );
  }

  const detailCategory = view.mode === "detail" ? openCategory(view.categoryId) : null;
  if (view.mode === "detail" && detailCategory) {
    const catAccent = accentByCategoryId.get(detailCategory.id) ?? accent;
    return (
      <CategoryDetail
        category={detailCategory}
        accent={catAccent}
        forLabel={forLabel}
        onBack={() => setView({ mode: "list" })}
        onAddItem={() => setView({ mode: "item", categoryId: detailCategory.id, returnTo: "detail" })}
        onRename={() => setView({ mode: "category", editing: detailCategory, returnTo: "detail" })}
        onDelete={async () => {
          await onDeleteCategory(detailCategory.id);
          setView({ mode: "list" });
        }}
        onEditItem={(item) => setView({ mode: "item", categoryId: detailCategory.id, editing: item, returnTo: "detail" })}
        onDeleteItem={(id) => void onDeleteItem(id)}
      />
    );
  }

  // list view (also the fallback when a detail category was deleted out from under us)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SearchField value={search} onChange={setSearch} placeholder="Search wishlist…" />
          <button
            type="button"
            onClick={() => setView({ mode: "category", returnTo: "list" })}
            className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
          >
            New list
          </button>
          {shareToPhone && (
            <button
              type="button"
              onClick={() => setView({ mode: "phone" })}
              className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
            >
              From phone
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Refresh wishlist"
              title="Refresh — picks up links added from your phone"
              className="tap-target shrink-0 rounded-md border p-1.5 transition-colors disabled:opacity-60"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={refreshing ? "animate-spin" : undefined}
              >
                <path d="M16.5 5.5a7 7 0 1 0 1.2 5" />
                <path d="M17 3v4h-4" />
              </svg>
            </button>
          )}
        </div>
        <PrimaryAction label="New item" accent={accent} onClick={() => setView({ mode: "item", returnTo: "list" })} />
      </div>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load your wishlist — try again in a moment.
        </p>
      ) : categories.length === 0 ? (
        <InlineEmpty title="Nothing saved yet" description="Tap New item to save a link you both might want — group it under a list as you go." />
      ) : shownCategories.length === 0 ? (
        <InlineEmpty title="Nothing matches that search" description="Try a different term." />
      ) : (
        <div className="flex flex-col gap-2">
          {shownCategories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              accent={accentByCategoryId.get(category.id) ?? accent}
              onOpen={() => setView({ mode: "detail", categoryId: category.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
