"use client";

import { CHIP_CLS, chipStyle } from "@/components/ui/Chip";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/icons";
import { FIELD_CLS, FIELD_STYLE, LABEL_CLS, LABEL_STYLE } from "@/components/ui/formField";

export interface NewProductDraft {
  name: string;
  brand: string | null;
  /** Ingredient names, as typed or picked — the caller resolves each to a
   * food item, creating the ones that don't exist yet. */
  ingredients: string[];
}

const MAX_SUGGESTIONS = 6;

/** Log → Food: define a product (e.g. a protein shake) and its ingredients
 * in one go. Saving creates the product and logs every ingredient. */
export function ProductForm({
  initialName,
  knownFoods,
  accent,
  busy,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  /** Every food name already tracked or in the catalog, offered as
   * suggestions while typing an ingredient. */
  knownFoods: string[];
  accent: string;
  busy: boolean;
  onSubmit: (draft: NewProductDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const has = (n: string) => ingredients.some((i) => i.toLowerCase() === n.toLowerCase());
  const query = draft.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return [];
    const taken = new Set(ingredients.map((i) => i.toLowerCase()));
    return knownFoods.filter((f) => f.toLowerCase().includes(query) && !taken.has(f.toLowerCase())).slice(0, MAX_SUGGESTIONS);
  }, [query, knownFoods, ingredients]);

  function addIngredient(value: string) {
    const trimmed = value.trim();
    if (trimmed && !has(trimmed)) setIngredients((prev) => [...prev, trimmed]);
    setDraft("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // A half-typed ingredient still counts when Save is pressed.
    const pending = draft.trim();
    const all = pending && !has(pending) ? [...ingredients, pending] : ingredients;
    if (!name.trim() || all.length === 0) return;
    onSubmit({ name: name.trim(), brand: brand.trim() || null, ingredients: all });
  }

  const canSave = name.trim().length > 0 && (ingredients.length > 0 || draft.trim().length > 0) && !busy;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        New product
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className={LABEL_CLS} style={LABEL_STYLE}>
            Name
          </span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={FIELD_CLS} style={FIELD_STYLE} />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5">
          <span className={LABEL_CLS} style={LABEL_STYLE}>
            Brand <span style={{ color: "var(--text-muted)" }}>· optional</span>
          </span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} placeholder="e.g. Maczfit" className={FIELD_CLS} style={FIELD_STYLE} />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL_CLS} style={LABEL_STYLE}>
          Ingredients
        </span>
        {ingredients.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ingredients.map((ing) => (
              <span
                key={ing}
                className={CHIP_CLS}
                style={chipStyle(false)}
              >
                {ing}
                <button
                  type="button"
                  onClick={() => setIngredients((prev) => prev.filter((i) => i !== ing))}
                  aria-label={`Remove ${ing}`}
                  style={{ color: "var(--text-muted)" }}
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addIngredient(draft);
              }
            }}
            placeholder="Type an ingredient, e.g. Banana"
            maxLength={120}
            className={`${FIELD_CLS} min-w-0 flex-1`}
            style={FIELD_STYLE}
          />
          <Button type="button" variant="tinted" accent={accent} onClick={() => addIngredient(draft)} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addIngredient(s)}
                className="min-h-9 rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)", background: "var(--surface-1)" }}
              >
                + {s}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Anything you haven&apos;t tracked yet is added to your foods automatically.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" accent={accent} disabled={!canSave}>
          {busy ? "Saving…" : "Add & log"}
        </Button>
        <button type="button" onClick={onCancel} className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
