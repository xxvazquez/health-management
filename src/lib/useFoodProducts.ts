"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  createFoodProduct,
  deleteFoodProduct,
  fetchFoodProducts,
  updateFoodProduct,
  type FoodProduct,
  type FoodProductPatch,
  type NewFoodProductInput,
} from "@/lib/supabase/foodProducts";
import { useSnapshotCache } from "@/lib/useSnapshotCache";

/** Module-level cache so every Log-page visit shares one products state
 * across client-side navigation — same pattern as useMeals / useDoctors. */
let cache: { userId: string; products: FoodProduct[] } | null = null;

const PRODUCTS_TABLES = ["food_products", "food_product_ingredients"] as const;

function demoId(): string {
  return `demo-product-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Signed-out demo state starts empty — there's no fixed pre-seeded example
 * (Food's demo history is randomly regenerated each load, see demoData.ts,
 * so there's no stable ingredient identity to point a fixed example at) —
 * but create/edit/remove still work locally within the session, same as
 * useDoctors, so trying the feature out while signed out isn't a dead end. */
export function useFoodProducts() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const isDemo = !authLoading && !session;
  const seed = cache && cache.userId === userId ? cache : null;

  const [products, setProducts] = useState<FoodProduct[]>(() => seed?.products ?? []);
  const [loading, setLoading] = useState(seed === null);
  const [error, setError] = useState(false);

  const { persist } = useSnapshotCache<{ products: FoodProduct[] }>({
    feature: "foodProducts",
    tables: PRODUCTS_TABLES,
    userId,
    isDemo: isDemo || authLoading,
    seeded: seed !== null,
    fetcher: async () => ({ products: await fetchFoodProducts() }),
    apply: ({ products: p }) => {
      setProducts(p);
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
      cache = { userId, products };
      persist({ products });
    }
  }, [userId, isDemo, loading, products, persist]);

  const create = useCallback(
    async (input: NewFoodProductInput) => {
      if (isDemo) {
        const created: FoodProduct = { id: demoId(), name: input.name.trim(), brand: input.brand?.trim() || null, isArchived: false, ingredientItemIds: input.ingredientItemIds };
        setProducts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        return created;
      }
      const created = await createFoodProduct(input);
      setProducts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      return created;
    },
    [isDemo],
  );

  const edit = useCallback(
    async (id: string, patch: FoodProductPatch) => {
      const current = products.find((p) => p.id === id);
      if (!current) return;
      if (isDemo) {
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)).sort((a, b) => a.name.localeCompare(b.name)));
        return;
      }
      const updated = await updateFoodProduct(current, patch);
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)).sort((a, b) => a.name.localeCompare(b.name)));
    },
    [isDemo, products],
  );

  const remove = useCallback(
    async (id: string) => {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      if (!isDemo) await deleteFoodProduct(id);
    },
    [isDemo],
  );

  return { data: products, loading, error, create, edit, remove };
}
