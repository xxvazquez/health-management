import Link from "next/link";

export function EmptyState({
  title = "No data yet",
  description = "Log something on the Log page, or sign in there to pull down data already in Supabase.",
  showLogLink = true,
}: {
  title?: string;
  description?: string;
  showLogLink?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center"
      style={{ borderColor: "var(--border-hairline)" }}
    >
      <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      <p className="mt-2 max-w-sm text-sm" style={{ color: "var(--text-secondary)" }}>
        {description}
      </p>
      {showLogLink && (
        <Link
          href="/log"
          className="mt-5 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--series-1)" }}
        >
          Go to Log
        </Link>
      )}
    </div>
  );
}
