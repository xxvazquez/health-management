import Link from "next/link";
import { Logo } from "@/components/Logo";

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
