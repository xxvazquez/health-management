/** Postgrest caps a response at its max-rows setting (1000 on Supabase), so
 * a plain select silently drops everything past that. This reads page after
 * page until one comes back short. `page` must apply an ORDER BY that is
 * unique per row (the primary key): without one Postgres may return rows in
 * a different order for each page, skipping some and repeating others. */
export const PAGE_SIZE = 1000;

export async function fetchPaged<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}
