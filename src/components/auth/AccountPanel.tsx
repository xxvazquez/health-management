"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/supabase/AuthContext";
import { useData } from "@/lib/DataContext";
import { usePartnerLinked } from "@/lib/usePartnerLinked";
import { relativeTime } from "@/lib/relativeTime";
import { Sheet } from "@/components/ui/Sheet";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { ChevronIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/Logo";
import { FIELD_CLS, FIELD_STYLE } from "@/components/ui/formField";

/** A row in the account menu's utility list. */
function MenuLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex min-h-11 items-center justify-between gap-2 px-3.5 text-sm transition-colors hover:bg-black/[0.04]"
      style={{ color: "var(--text-primary)" }}
    >
      {children}
      <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
        <ChevronIcon dir="right" size={14} />
      </span>
    </Link>
  );
}

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
  const partnerLinked = usePartnerLinked();
  const [mode, setMode] = useState<"signIn" | "signUp" | "reset">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

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
    <Sheet
      title={session ? "Account" : "LAUVA"}
      titleId="account-panel-title"
      onClose={closePanel}
      icon={session ? undefined : <Logo size={22} />}
      subtitle={
        !session && (
          <p className="text-xs leading-snug" style={{ color: "var(--text-secondary)" }}>
            Private tracking for food, symptoms, supplements, habits and your cycle — with the trends afterwards.
          </p>
        )
      }
    >
      {session && (
        <FormGroup>
          {!partnerLinked && (
            // The one place a solo user can reach the partner-link flow —
            // Messages only enters the nav once a partner is linked.
            <MenuLink href="/notes" onClick={closePanel}>
              Link a partner
            </MenuLink>
          )}
          <MenuLink href="/manage" onClick={closePanel}>
            Settings
          </MenuLink>
          <MenuLink href="/help" onClick={closePanel}>
            Help
          </MenuLink>
          <MenuLink href="/my-drive" onClick={closePanel}>
            Google Drive
          </MenuLink>
        </FormGroup>
      )}

      {!configured && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Cloud sync isn&apos;t set up for this deployment yet — data stays on this device only.
        </p>
      )}

      {configured && session && (
        <>
          <FormGroup
            footer={
              syncState.pending > 0
                ? `${syncState.pending} ${syncState.pending === 1 ? "change" : "changes"} saved on this device${isOnline ? ", uploading…" : " — will upload when you're back online"}`
                : undefined
            }
          >
            <div className="flex min-h-11 items-center gap-3 px-3.5 text-sm">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Signed in as
              </span>
              <span className="min-w-0 flex-1 truncate text-right font-medium" style={{ color: "var(--text-primary)" }}>
                {session.user.email}
              </span>
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 px-3.5">
              <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: syncState.deadLetter > 0 ? "var(--status-warning)" : !isOnline || syncState.pending > 0 || syncing ? "var(--text-muted)" : "var(--status-good)",
                  }}
                />
                {syncing ? "Syncing…" : !isOnline ? "Offline" : lastSyncedAt ? `Synced ${relativeTime(lastSyncedAt)}` : "Not synced yet"}
              </span>
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={syncing || !isOnline}
                className="text-sm font-medium disabled:opacity-40"
                style={{ color: "var(--ui-accent)" }}
              >
                Sync now
              </button>
            </div>
          </FormGroup>

          <FormGroup>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={submitting}
              className="flex min-h-11 w-full items-center justify-center text-sm font-medium disabled:opacity-50"
              style={{ color: "var(--status-critical)" }}
            >
              Sign out
            </button>
          </FormGroup>
        </>
      )}

      {configured && !session && mode === "reset" && (
        <form onSubmit={handleResetSubmit} className="flex flex-col gap-3">
          {resetSent ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              If an account exists for <span className="font-medium" style={{ color: "var(--text-primary)" }}>{email}</span>, a
              link to set a new password is on its way. Check your inbox.
            </p>
          ) : (
            <>
              <FormGroup footer="Enter your email and we'll send a link to set a new password.">
                <Field label="Email">
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
                    className={`${FIELD_CLS} w-full`}
                    style={FIELD_STYLE}
                  />
                </Field>
              </FormGroup>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </>
          )}
          <button type="button" onClick={() => goToMode("signIn")} className="self-center text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
            Back to sign in
          </button>
          {resetError && (
            <span className="text-xs" style={{ color: "var(--status-critical)" }}>
              {resetError}
            </span>
          )}
        </form>
      )}

      {configured && !session && mode !== "reset" && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormGroup>
            <Field label="Email">
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
                className={`${FIELD_CLS} w-full`}
                style={FIELD_STYLE}
              />
            </Field>
            <Field
              label={
                <span className="flex items-center justify-between gap-2">
                  Password
                  {mode === "signIn" && (
                    <button type="button" onClick={() => goToMode("reset")} className="font-medium" style={{ color: "var(--ui-accent)" }}>
                      Forgot?
                    </button>
                  )}
                </span>
              }
            >
              <input
                type="password"
                required
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${FIELD_CLS} w-full`}
                style={FIELD_STYLE}
              />
            </Field>
          </FormGroup>
          {error && (
            <span className="text-xs" style={{ color: "var(--status-critical)" }}>
              {error}
            </span>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {mode === "signIn" ? "Sign in" : "Create account"}
          </Button>
          <p className="text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            {mode === "signIn" ? "New here? " : "Have an account? "}
            <button type="button" onClick={() => goToMode(mode === "signIn" ? "signUp" : "signIn")} className="font-medium" style={{ color: "var(--ui-accent)" }}>
              {mode === "signIn" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </form>
      )}

      {configured && !session && (
        <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
          You can look around without an account — nothing is saved until you sign in.{" "}
          <Link href="/help" onClick={closePanel} className="font-medium underline" style={{ color: "var(--ui-accent)" }}>
            What is Lauva?
          </Link>
        </p>
      )}
    </Sheet>
  );
}

export { displayNameFromEmail };
