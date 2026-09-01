"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./client";

interface AuthContextValue {
  configured: boolean;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Emails a password-reset link that lands on `/reset`. Resolves with a
   * message only on a real failure (rate limit, network) — an unknown
   * address still resolves `{ error: null }`, so the UI can't be used to
   * probe which emails have accounts. */
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** Sets a new password for the currently-authenticated user — used by
   * the `/reset` page once the recovery link has established a session. */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  /** Whether the single global account panel (sign in/up form, or account
   * info + sign out once signed in) is open. Shared state so both the main
   * menu's account button and the logged-out banner open the same panel
   * instead of each page growing its own login UI. */
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
    } else {
      // Signed in — close the panel so the user isn't left staring at a
      // stale login form after it already worked.
      setPanelOpen(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    setError(null);
    const { error: err } = await supabase.auth.signUp({ email, password });
    if (err) {
      setError(err.message);
    } else {
      setPanelOpen(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return { error: "Cloud sync isn't set up for this deployment." };
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset/`,
    });
    return { error: err?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return { error: "Cloud sync isn't set up for this deployment." };
    const { error: err } = await supabase.auth.updateUser({ password });
    return { error: err?.message ?? null };
  }, []);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const value = useMemo(
    () => ({
      configured: supabaseConfigured,
      session,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
      panelOpen,
      openPanel,
      closePanel,
    }),
    [session, loading, error, signIn, signUp, signOut, sendPasswordReset, updatePassword, panelOpen, openPanel, closePanel],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
