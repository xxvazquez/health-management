"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { createRecipe, deleteRecipe, fetchRecipes, updateRecipe, type Recipe, type RecipeInput } from "@/lib/supabase/recipes";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** Module-level cache so every visit shares one recipes state across
 * client-side navigation — same pattern as useFoodProducts. */
let cache: { userId: string; recipes: Recipe[] } | null = null;

const RECIPES_TABLES = ["recipes", "recipe_ingredients"] as const;

/** Best first, then A–Z. */
function sortRecipes(list: Recipe[]): Recipe[] {
  return [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name));
}

/** Signed out, recipes start empty but can be made and edited for the
 * session, like food products. */
export function useRecipes() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [recipes, setRecipes] = useState<Recipe[]>(() => seed?.recipes ?? []);
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const { persist } = useSnapshotCache<{ recipes: Recipe[] }>({
    feature: "recipes",
    tables: RECIPES_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => ({ recipes: await fetchRecipes() }),
    apply: ({ recipes: r }) => {
      setRecipes(sortRecipes(r));
      setError(false);
    },
    onSettled: () => setLoading(false),
    onError: () => setError(true),
  });

  useEffect(() => {
    if (isDemo || !userId) {
      cache = null;
      return;
    }
    if (!loading) {
      cache = { userId, recipes };
      persist({ recipes });
    }
  }, [userId, isDemo, loading, recipes, persist]);

  const create = useCallback(
    async (input: RecipeInput) => {
      const created: Recipe = isDemo ? { ...input, id: `demo-recipe-${Date.now()}`, createdAt: new Date().toISOString() } : await createRecipe(input);
      setRecipes((prev) => sortRecipes([...prev, created]));
      return created;
    },
    [isDemo],
  );

  const save = useCallback(
    async (next: Recipe) => {
      const previous = recipes.find((r) => r.id === next.id);
      if (!previous) return;
      setRecipes((prev) => sortRecipes(prev.map((r) => (r.id === next.id ? next : r))));
      if (!isDemo) await updateRecipe(previous, next);
    },
    [isDemo, recipes],
  );

  const remove = useCallback(
    async (id: string) => {
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      if (!isDemo) await deleteRecipe(id);
    },
    [isDemo],
  );

  return { data: recipes, loading, error, create, save, remove };
}
