import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div
      className="flex min-h-[70vh] flex-col items-center justify-center rounded-xl border bg-cover bg-center px-6 py-16 text-center"
      style={{ borderColor: "var(--border-hairline)", backgroundImage: "url(/background.png)", backgroundColor: "var(--surface-1)" }}
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
      <Button href="/log" size="xl" className="mt-6">
        Back to Log
      </Button>
    </div>
  );
}
