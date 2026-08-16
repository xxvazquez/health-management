"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";

export function AuthWidget() {
  const { configured, session, loading, error, signIn, signUp, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!configured) {
    return (
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        Cloud sync not set up
      </span>
    );
  }

  if (loading) return null;

  if (session) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--status-good)" }} />
          Synced as {session.user.email}
        </span>
        <button type="button" onClick={() => void signOut()} className="underline decoration-dotted">
          Sign out
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs underline decoration-dotted"
        style={{ color: "var(--text-muted)" }}
      >
        Sign in to sync to the cloud
      </button>
    );
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-1.5">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        className="w-36 rounded-md border px-2 py-1 text-xs outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        className="w-28 rounded-md border px-2 py-1 text-xs outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50"
        style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
      >
        {mode === "signIn" ? "Sign in" : "Create account"}
      </button>
      <button
        type="button"
        onClick={() => setMode((m) => (m === "signIn" ? "signUp" : "signIn"))}
        className="text-xs underline decoration-dotted"
        style={{ color: "var(--text-muted)" }}
      >
        {mode === "signIn" ? "new here?" : "have an account?"}
      </button>
      {error && (
        <span className="w-full text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </span>
      )}
    </form>
  );
}
