import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div
      className="flex min-h-[70vh] flex-col items-center justify-center rounded-xl border bg-cover bg-center px-6 py-16 text-center"
      style={{ borderColor: "var(--border-hairline)", backgroundImage: "url(/banner.png)", backgroundColor: "var(--surface-1)" }}
    >
      <Logo size={48} />
      <p className="mt-6 text-sm font-semibold tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>
        404
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        Nothing tracked here
      </h1>
      <p className="mt-2 max-w-sm text-sm" style={{ color: "var(--text-secondary)" }}>
        This page doesn&apos;t exist, or moved. Nothing was lost — your data lives on the pages below.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md px-5 py-2 text-sm font-medium whitespace-nowrap text-white"
        style={{ background: "var(--series-1)" }}
      >
        Back to Overview
      </Link>
    </div>
  );
}
