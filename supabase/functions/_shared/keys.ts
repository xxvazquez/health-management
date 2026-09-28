// The project's API keys, as injected into every Edge Function. The new
// `sb_secret_` / `sb_publishable_` keys arrive as JSON dictionaries
// (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS, "default" entry);
// the legacy JWT keys are only a fallback for a runtime that doesn't
// provide them.

function defaultKey(envName: string): string | undefined {
  const raw = Deno.env.get(envName);
  if (!raw) return undefined;
  try {
    const key = JSON.parse(raw)?.default;
    return typeof key === "string" && key ? key : undefined;
  } catch {
    return undefined;
  }
}

/** Server-only key that bypasses RLS. */
export function secretKey(): string | undefined {
  return defaultKey("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

/** Public key, for a client acting as the calling user. */
export function publishableKey(): string | undefined {
  return defaultKey("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_ANON_KEY");
}
