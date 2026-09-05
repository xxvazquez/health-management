import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";

/** The in-page "nothing here" state — for a section inside a page that
 * already has its own heading, tabs and add button, where the full-page
 * EmptyState below would be too heavy. A centred title and one line. */
export function InlineEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-xs text-xs" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
      )}
    </div>
  );
}

/** Full-panel "couldn't load" message for a board or dashboard whose data
 * fetch failed. Pair with `<ListSkeleton />` for loading and
 * `<InlineEmpty />` for the no-data state. `what` names the data, e.g.
 * "your wishlist", "tasks". */
export function ErrorState({ what }: { what: string }) {
  return (
    <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
      Couldn&apos;t load {what} — try again in a moment.
    </p>
  );
}

export function EmptyState({
  title = "Nothing logged yet",
  description = "Start logging on the Log page and this fills in. Signed in on another device? It syncs down automatically.",
  showLogLink = true,
}: {
  title?: string;
  description?: string;
  showLogLink?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center"
      style={{ borderColor: "var(--border-hairline)" }}
    >
      <span className="mb-4 opacity-90">
        <Logo size={56} />
      </span>
      <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      <p className="mt-2 max-w-sm text-sm" style={{ color: "var(--text-secondary)" }}>
        {description}
      </p>
      {showLogLink && (
        <Button href="/log" size="lg" className="mt-5">
          Go to Log
        </Button>
      )}
    </div>
  );
}
