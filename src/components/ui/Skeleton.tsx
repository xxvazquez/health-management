/** Loading placeholders — a quiet shimmer instead of the word "Loading…".
 * `Skeleton` is one grey bar; `PageSkeleton` is a header + a few cards,
 * the shape most of the app's pages settle into once data arrives. */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md ${className}`} style={{ background: "var(--gridline)" }} />;
}

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: cards }).map((_, i) => (
        <CardSkeleton key={i} lines={i === 0 ? 4 : 3} />
      ))}
    </div>
  );
}
