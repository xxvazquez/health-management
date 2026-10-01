"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import { useMeals } from "@/lib/useMeals";
import { useRecipes } from "@/lib/useRecipes";
import { getAllItems, withDataLock } from "@/lib/db/indexedDb";
import { ratedCombos, type RatedCombo, type RatedOccasion } from "@/lib/aggregations/favouriteCombos";
import { RECIPE_UNITS, type Recipe, type RecipeIngredient, type RecipeUnit } from "@/lib/supabase/recipes";
import { Sheet } from "@/components/ui/Sheet";
import { FormGroup } from "@/components/ui/FormGroup";
import { Field } from "@/components/ui/Field";
import { StarRating } from "@/components/ui/StarRating";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { PickerList } from "@/components/ui/PickerList";
import { InfoIcon, MinusIcon, UpDownChevronIcon } from "@/components/ui/icons";
import { TrendGroup, ShowAllRow } from "@/components/analytics/TrendList";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";

const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];
const SHORT_LIST = 5;

/** "Pumpkin, Cumin and Onion" */
function comboPhrase(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Every food's id → name: logged ones from the events, plus the rest of
 * the catalogue from the local store. */
export function useFoodNames(): Map<string, string> {
  const { events } = useData();
  const [foods, setFoods] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const fromEvents = new Map(events.filter((e) => e.itemType === "food").map((e) => [e.itemIdentity, e.item]));
    void withDataLock(() => getAllItems())
      .then((items) => {
        if (cancelled) return;
        for (const i of items) if (i.itemType === "food" && !i.isArchived) fromEvents.set(i.identity, i.rawName);
        setFoods(new Map(fromEvents));
      })
      .catch(() => !cancelled && setFoods(fromEvents));
    return () => {
      cancelled = true;
    };
  }, [events]);
  return foods;
}

/** Trends → Food → Combinations: the foods eaten together in the best
 * (and worst) rated meals and recipes. Renders nothing until a combo has
 * come up in two rated meals. */
export function LovedCombos({ accent }: { accent: string }) {
  const { events } = useData();
  const meals = useMeals();
  const recipes = useRecipes();
  const foods = useFoodNames();
  const [showAll, setShowAll] = useState(false);

  const combos = useMemo(() => {
    const byMeal = new Map<string, Set<string>>();
    for (const e of events) {
      if (e.itemType !== "food" || !e.completed || !e.mealTag) continue;
      const key = `${e.date}|${e.mealTag}`;
      byMeal.set(key, (byMeal.get(key) ?? new Set()).add(e.item));
    }
    const occasions: RatedOccasion[] = [];
    for (const m of meals.meals) {
      const items = byMeal.get(`${m.date}|${m.mealTag}`);
      if (m.rating != null && items && items.size >= 2) occasions.push({ items: [...items], rating: m.rating });
    }
    for (const r of recipes.data) {
      const items = r.ingredients.map((i) => foods.get(i.itemId)).filter((n): n is string => Boolean(n));
      if (r.rating != null && items.length >= 2) occasions.push({ items, rating: r.rating });
    }
    return ratedCombos(occasions);
  }, [events, meals.meals, recipes.data, foods]);

  const loved = combos.filter((c) => c.average >= 4);
  const disliked = combos.filter((c) => c.average <= 2.5).reverse();
  if (loved.length === 0 && disliked.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {loved.length > 0 && (
        <TrendGroup caption="Combos you love">
          {(showAll ? loved : loved.slice(0, SHORT_LIST)).map((c) => (
            <ComboRow key={c.items.join("+")} combo={c} accent={accent} />
          ))}
          {loved.length > SHORT_LIST && <ShowAllRow total={loved.length} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />}
        </TrendGroup>
      )}
      {disliked.length > 0 && (
        <TrendGroup caption="Combos you don't">
          {disliked.slice(0, SHORT_LIST).map((c) => (
            <ComboRow key={c.items.join("+")} combo={c} accent="var(--text-muted)" />
          ))}
        </TrendGroup>
      )}
    </div>
  );
}

/** Log → Food → Recipes: tap a recipe to log its foods for the current
 * meal; ⓘ opens it to edit. */
export function RecipeList({
  recipes,
  accent,
  onLog,
  pendingId,
}: {
  /** The page's own `useRecipes()`, so a recipe saved elsewhere on it shows here at once. */
  recipes: ReturnType<typeof useRecipes>;
  accent: string;
  onLog?: (recipe: Recipe) => void;
  pendingId?: string | null;
}) {
  const foods = useFoodNames();
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);

  return (
    <>
      <div className="inset-rows rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        {recipes.data.map((r) => (
          <div key={r.id} className="flex items-center" style={{ opacity: pendingId === r.id ? 0.5 : 1 }}>
            <button
              type="button"
              onClick={() => (onLog ? onLog(r) : setEditing(r))}
              disabled={pendingId === r.id}
              aria-label={onLog ? `Log ${r.name}` : undefined}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 pl-3.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm" style={{ color: "var(--text-primary)" }}>
                  {r.name}
                </span>
                <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
                  {r.ingredients.map((i) => foods.get(i.itemId)).filter(Boolean).join(", ")}
                </span>
              </span>
              <StarRating value={r.rating} size="sm" accent={accent} />
            </button>
            <button
              type="button"
              onClick={() => setEditing(r)}
              aria-label={`Edit ${r.name}`}
              aria-haspopup="dialog"
              className="flex h-11 w-11 shrink-0 items-center justify-center"
              style={{ color: accent }}
            >
              <InfoIcon size={18} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setEditing("new")} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium" style={{ color: accent }}>
          New recipe
        </button>
      </div>

      {editing && (
        <RecipeSheet
          key={editing === "new" ? "new" : editing.id}
          recipe={editing === "new" ? null : editing}
          foods={foods}
          accent={accent}
          onSave={async (draft) => {
            if (editing === "new") await recipes.create(draft);
            else await recipes.save({ ...editing, ...draft });
            setEditing(null);
          }}
          onDelete={
            editing === "new"
              ? undefined
              : async () => {
                  await recipes.remove(editing.id);
                  setEditing(null);
                }
          }
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ComboRow({ combo, accent }: { combo: RatedCombo; accent: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-3.5 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-sm" style={{ color: "var(--text-primary)" }}>
          {comboPhrase(combo.items)}
        </span>
        <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
          {combo.count} meals
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums" style={{ color: accent }}>
        {combo.average.toFixed(1)}
        <StarRating value={1} size="sm" accent={accent} />
      </span>
    </div>
  );
}

type Draft = Omit<Recipe, "id" | "createdAt">;

/** Create or edit a recipe: name, meal, rating, foods with optional
 * amounts, steps and a note. */
function RecipeSheet({
  recipe,
  foods,
  accent,
  onSave,
  onDelete,
  onClose,
}: {
  recipe: Recipe | null;
  foods: Map<string, string>;
  accent: string;
  onSave: (draft: Draft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState<Draft>(() => ({
    name: recipe?.name ?? "",
    mealTag: recipe?.mealTag ?? null,
    rating: recipe?.rating ?? null,
    steps: recipe?.steps.length ? recipe.steps : [""],
    note: recipe?.note ?? "",
    ingredients: recipe?.ingredients ?? [],
  }));
  const [pickingFoods, setPickingFoods] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const foodOptions = useMemo(() => [...foods].map(([id, name]) => ({ value: id, label: name })), [foods]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setIngredient = (index: number, patch: Partial<RecipeIngredient>) =>
    set({ ingredients: draft.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)) });

  function toggleIngredient(id: string) {
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.some((i) => i.itemId === id)
        ? d.ingredients.filter((i) => i.itemId !== id)
        : [...d.ingredients, { itemId: id, amount: null, unit: null }],
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ ...draft, steps: draft.steps.map((s) => s.trim()).filter(Boolean), note: draft.note?.trim() || null });
    } catch (err) {
      console.error("recipe save failed", err);
      setSaving(false);
    }
  }

  if (pickingFoods) {
    return (
      <Sheet title="Foods" titleId={titleId} onClose={onClose} back={{ label: recipe ? "Recipe" : "New recipe", onClick: () => setPickingFoods(false) }}>
        <PickerList
          options={foodOptions}
          isSelected={(id) => draft.ingredients.some((i) => i.itemId === id)}
          onPick={toggleIngredient}
          placeholder="Search your foods"
          accent={accent}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      title={recipe ? "Recipe" : "New recipe"}
      titleId={titleId}
      onClose={onClose}
      form={{ onSubmit: submit, submitLabel: recipe ? "Done" : "Add", submitDisabled: !draft.name.trim() || saving, busy: saving, accent }}
    >
      <div className="flex flex-col gap-4">
        <FormGroup>
          <Field label="Name">
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Pumpkin soup" maxLength={80} className={ROW_TEXT_CLS} style={ROW_STYLE} />
          </Field>
          <label className="relative flex min-h-11 items-center gap-3 px-3.5">
            <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
              Meal
            </span>
            <span className="flex items-center gap-1 text-sm" style={{ color: draft.mealTag ? accent : "var(--text-muted)" }}>
              {draft.mealTag ?? "Any"}
              <UpDownChevronIcon size={11} />
            </span>
            <select
              value={draft.mealTag ?? ""}
              onChange={(e) => set({ mealTag: e.target.value || null })}
              aria-label="Meal"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            >
              <option value="">Any</option>
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-h-11 items-center justify-between gap-3 pr-1.5 pl-3.5">
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              Rating
            </span>
            <StarRating value={draft.rating} onChange={(rating) => set({ rating })} accent={accent} label="Rate this recipe" />
          </div>
        </FormGroup>

        <FormGroup title="Foods">
          {draft.ingredients.map((ing, i) => (
            <div key={ing.itemId} className="flex min-h-11 items-center gap-2 pr-2 pl-3.5">
              <button
                type="button"
                onClick={() => set({ ingredients: draft.ingredients.filter((_, j) => j !== i) })}
                aria-label={`Remove ${foods.get(ing.itemId) ?? "food"}`}
                className="tap-target flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--status-critical)", color: "var(--on-accent)" }}
              >
                <MinusIcon size={10} />
              </button>
              <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                {foods.get(ing.itemId) ?? "Food"}
              </span>
              <input
                value={ing.amount ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  setIngredient(i, { amount: e.target.value.trim() === "" || !(n > 0) ? null : n, unit: ing.unit ?? "g" });
                }}
                inputMode="decimal"
                placeholder="—"
                aria-label={`Amount of ${foods.get(ing.itemId) ?? "food"}`}
                className={`${ROW_INLINE_CLS} w-14`}
                style={ROW_STYLE}
              />
              <label className="relative flex w-12 shrink-0 items-center justify-end gap-0.5 text-sm" style={{ color: ing.amount != null ? accent : "var(--text-muted)" }}>
                {ing.unit ?? "g"}
                <UpDownChevronIcon size={10} />
                <select
                  value={ing.unit ?? "g"}
                  onChange={(e) => setIngredient(i, { unit: e.target.value as RecipeUnit })}
                  aria-label="Unit"
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                >
                  {RECIPE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
          <button type="button" onClick={() => setPickingFoods(true)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium" style={{ color: accent }}>
            Add foods
          </button>
        </FormGroup>

        <FormGroup title="Steps">
          {draft.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3 px-3.5 py-2">
              <span className="w-4 shrink-0 pt-0.5 text-sm tabular-nums" style={{ color: "var(--text-muted)" }}>
                {i + 1}
              </span>
              <AutoGrowTextarea
                value={step}
                onChange={(e) => set({ steps: draft.steps.map((s, j) => (j === i ? e.target.value : s)) })}
                rows={1}
                maxRows={6}
                placeholder={i === 0 ? "First step" : "Next step"}
                aria-label={`Step ${i + 1}`}
                className={`${ROW_TEXT_CLS} resize-none`}
                style={ROW_STYLE}
              />
            </div>
          ))}
          <button type="button" onClick={() => set({ steps: [...draft.steps, ""] })} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium" style={{ color: accent }}>
            Add step
          </button>
        </FormGroup>

        <FormGroup>
          <Field label="Note">
            <AutoGrowTextarea
              value={draft.note ?? ""}
              onChange={(e) => set({ note: e.target.value })}
              rows={1}
              maxRows={8}
              placeholder="What makes it good"
              className={`${ROW_TEXT_CLS} resize-none`}
              style={ROW_STYLE}
            />
          </Field>
        </FormGroup>

        {onDelete && (
          <FormGroup>
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--status-critical)" }}>
              Delete recipe
            </button>
          </FormGroup>
        )}
      </div>
      {confirmDelete && onDelete && (
        <ConfirmDialog
          title="Delete this recipe?"
          message="Its foods, amounts and steps go too. Your logged meals stay."
          confirmLabel="Delete"
          destructive
          onConfirm={() => void onDelete()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </Sheet>
  );
}
