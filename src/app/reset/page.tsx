"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/supabase/AuthContext";
import { Card } from "@/components/ui/Card";

const INPUT_STYLE = { borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" };

/** Where the password-reset email link lands. Supabase's JS client picks
 * the recovery token out of the URL on load and establishes a session;
 * once it has, this shows a set-a-new-password form. A stale or hand-typed
 * URL has no session and gets the "invalid link" message instead. */
export default function ResetPasswordPage() {
  const { configured, session, loading, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The client processes the recovery token asynchronously — wait a beat
  // before calling a session-less page a broken link.
  const [grace, setGrace] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGrace(false), 2500);
    return () => clearTimeout(t);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Use at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await updatePassword(password);
    setSubmitting(false);
    if (err) setError(err);
    else setDone(true);
  }

  return (
    <div className="mx-auto max-w-sm py-6">
      <Card tier="supporting" className="flex flex-col gap-4">
        <h1 className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Reset password
        </h1>

        {!configured ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Cloud sync isn&apos;t set up for this deployment.
          </p>
        ) : done ? (
          <>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Your password&apos;s been updated and you&apos;re signed in.
            </p>
            <Link
              href="/log/"
              className="self-start rounded-md px-3 py-2 text-sm font-medium text-white"
              style={{ background: "var(--series-1)" }}
            >
              Go to Lauva
            </Link>
          </>
        ) : loading || (!session && grace) ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Checking your reset link…
          </p>
        ) : !session ? (
          <>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              This reset link is invalid or has expired. Open the log-in screen and request a new one.
            </p>
            <Link
              href="/log/"
              className="self-start rounded-md border px-3 py-2 text-sm font-medium"
              style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
            >
              Back to Lauva
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              New password
              <input
                type="password"
                required
                autoFocus
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm outline-none"
                style={INPUT_STYLE}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Confirm new password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm outline-none"
                style={INPUT_STYLE}
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--series-1)" }}
            >
              {submitting ? "Saving…" : "Set new password"}
            </button>
            {error && (
              <span className="text-xs" style={{ color: "var(--status-critical)" }}>
                {error}
              </span>
            )}
          </form>
        )}
      </Card>
    </div>
  );
}
