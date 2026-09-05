"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { useData } from "@/lib/DataContext";
import { relativeTime } from "@/lib/relativeTime";
import { useDialogA11y } from "@/components/ui/useDialogA11y";
import { Button } from "@/components/ui/Button";

/** Derived from the email local-part — sign-in is email/password only, no
 * profile/name field exists to pull a real display name from. */
function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** The one global auth surface: a sign-in/up form when signed out, or
 * account info + sign out when signed in. Opened from the main menu's
 * account button and from the logged-out banner — never duplicated
 * per-page. */
export function AccountPanel() {
  const { configured, session, panelOpen, closePanel, error, signIn, signUp, signOut, sendPasswordReset } = useAuth();
  const { syncing, lastSyncedAt, isOnline, syncNow, syncState } = useData();
  const [mode, setMode] = useState<"signIn" | "signUp" | "reset">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const containerRef = useDialogA11y(panelOpen, closePanel);

  if (!panelOpen) return null;

  function goToMode(next: "signIn" | "signUp" | "reset") {
    setMode(next);
    setResetSent(false);
    setResetError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    if (mode === "signIn") {
      await signIn(email, password);
    } else {
      await signUp(email, password);
    }
    setSubmitting(false);
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResetError(null);
    const { error: err } = await sendPasswordReset(email);
    setSubmitting(false);
    if (err) setResetError(err);
    else setResetSent(true);
  }

  async function handleSignOut() {
    setSubmitting(true);
    await signOut();
    setSubmitting(false);
    closePanel();
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-panel-title"
    >
      <div className="absolute inset-0 bg-black/30" onClick={closePanel} />
      <div
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-xl border p-5 shadow-xl"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
      >
        <div className="flex items-center justify-between">
          <h2 id="account-panel-title" className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {session ? "Account" : mode === "signIn" ? "Log in" : mode === "signUp" ? "Create account" : "Reset password"}
          </h2>
          <button
            type="button"
            onClick={closePanel}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ color: "var(--text-secondary)", background: "var(--page-plane)" }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {!configured && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Cloud sync isn&apos;t set up for this deployment yet — data stays on this device only.
          </p>
        )}

        {configured && session && (
          <>
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--status-good)" }} />
              Signed in as <span className="font-medium">{session.user.email}</span>
            </div>

            <div className="flex flex-col gap-1.5 rounded-md border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--page-plane)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: syncState.deadLetter > 0 ? "var(--status-warning)" : !isOnline || syncState.pending > 0 || syncing ? "var(--text-muted)" : "var(--status-good)",
                    }}
                  />
                  {syncing
                    ? "Syncing…"
                    : !isOnline
                      ? "Offline"
                      : lastSyncedAt
                        ? `Synced ${relativeTime(lastSyncedAt)}`
                        : "Not synced yet"}
                </span>
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  disabled={syncing || !isOnline}
                  className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
                  style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
                >
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              </div>
              {syncState.pending > 0 && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {syncState.pending} {syncState.pending === 1 ? "change" : "changes"} saved on this device{isOnline ? ", uploading…" : " — will upload when you're back online"}
                </span>
              )}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={() => void handleSignOut()} disabled={submitting} className="self-start">
              Sign out
            </Button>
          </>
        )}

        {configured && !session && mode === "reset" && (
          <form onSubmit={handleResetSubmit} className="flex flex-col gap-2.5">
            {resetSent ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                If an account exists for <span className="font-medium" style={{ color: "var(--text-primary)" }}>{email}</span>, a
                link to set a new password is on its way. Check your inbox.
              </p>
            ) : (
              <>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Enter your email and we&apos;ll send a link to set a new password.
                </p>
                <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Email
                  <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-md border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                  />
                </label>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Sending…" : "Send reset link"}
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={() => goToMode("signIn")}
              className="self-start text-xs font-medium underline decoration-dotted"
              style={{ color: "var(--text-secondary)" }}
            >
              back to sign in
            </button>
            {resetError && (
              <span className="text-xs" style={{ color: "var(--status-critical)" }}>
                {resetError}
              </span>
            )}
          </form>
        )}

        {configured && !session && mode !== "reset" && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Email
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Password
              <input
                type="password"
                required
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
              />
            </label>
            <Button type="submit" disabled={submitting}>
              {mode === "signIn" ? "Sign in" : "Create account"}
            </Button>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => goToMode(mode === "signIn" ? "signUp" : "signIn")}
                className="text-xs font-medium underline decoration-dotted"
                style={{ color: "var(--text-secondary)" }}
              >
                {mode === "signIn" ? "new here? create an account" : "have an account? sign in"}
              </button>
              {mode === "signIn" && (
                <button
                  type="button"
                  onClick={() => goToMode("reset")}
                  className="shrink-0 text-xs font-medium underline decoration-dotted"
                  style={{ color: "var(--text-secondary)" }}
                >
                  forgot your password?
                </button>
              )}
            </div>
            {error && (
              <span className="text-xs" style={{ color: "var(--status-critical)" }}>
                {error}
              </span>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export { displayNameFromEmail };
