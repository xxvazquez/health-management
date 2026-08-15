/** Shared name-normalization used for taxonomy lookups and dedupe/data-quality checks. */
export function normalizeName(raw: string): string {
  return raw
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Title-ish cleanup for display when we don't have an explicit canonicalName override. */
export function titleCaseFallback(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
