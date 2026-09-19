/** Build details baked in by next.config.ts. */
export function appVersionLabel(): string {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const hash = process.env.NEXT_PUBLIC_COMMIT_HASH;
  const iso = process.env.NEXT_PUBLIC_COMMIT_DATE;
  const parts = [`Lauva v${version}`];
  if (hash) parts.push(hash);
  if (iso) {
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      parts.push(
        date.toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Warsaw",
        }),
      );
    }
  }
  return parts.join(" · ");
}
