"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

function ExitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4H4.8A1.8 1.8 0 0 0 3 5.8v8.4A1.8 1.8 0 0 0 4.8 16H8" />
      <path d="M12.5 13.5 16 10l-3.5-3.5" />
      <path d="M16 10H7.5" />
    </svg>
  );
}

/** Sign out, always visible next to the account entry when signed in — no
 * need to open the account panel just to find the way out. Asks first, so a
 * stray tap beside the account name doesn't sign anyone out. */
export function SignOutButton({ collapsed }: { collapsed?: boolean }) {
  const { configured, session, signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);

  if (!configured || !session) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Sign out"
        aria-label="Sign out"
        className={`flex shrink-0 items-center justify-center border transition-colors hover:opacity-80 ${collapsed ? "h-9 w-9 rounded-full" : "h-11 w-11 rounded-lg"}`}
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
      >
        <ExitIcon />
      </button>
      {confirming && (
        <ConfirmDialog
          title="Sign out?"
          confirmLabel="Sign Out"
          destructive
          onConfirm={() => {
            setConfirming(false);
            void signOut();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
