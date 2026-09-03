/** Loading placeholders — a quiet shimmer instead of the word "Loading…".
 * `Skeleton` is one grey bar; `PageSkeleton` is a header + a few cards,
 * the shape most of the app's pages settle into once data arrives. */

function Skeleton({ className = "" }: { className?: string }) {
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

/** A short stack of shimmer rows — for a list or board loading inside a page
 * that already has its own header and tabs, where PageSkeleton's header +
 * cards would double up. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3.5 py-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
