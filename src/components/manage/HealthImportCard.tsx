"use client";

import { useEffect, useState } from "react";
import { CollapsibleManageCard } from "@/components/manage/ManageSection";
import { FormGroup } from "@/components/ui/FormGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deletePhoneToken, fetchPhoneToken, functionAuthHeader, functionEndpoint, regeneratePhoneToken, type PhoneToken } from "@/lib/supabase/phoneTokens";

const TABLE = "health_import_tokens";

function lastImport(token: PhoneToken | null): string {
  if (!token?.lastUsedAt) return "Not yet";
  return new Date(token.lastUsedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** A row with a value to paste into Shortcuts and a Copy button. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-h-11 items-center gap-3 px-3.5">
      <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-xs" style={{ color: "var(--text-muted)" }}>
        {value}
      </span>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {})
        }
        className="hit-slop shrink-0 text-sm font-medium"
        style={{ color: "var(--ui-accent)" }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-start gap-3 px-3.5 py-2.5 text-sm" style={{ color: "var(--text-primary)" }}>
      <span className="w-4 shrink-0 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/** Settings → Workout → Apple Health: a nightly iOS Shortcut sends the day's
 * walking minutes from Apple Health to the health-import Edge Function,
 * which saves them as that day's Walking entry. */
export function HealthImportCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const [token, setToken] = useState<PhoneToken | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "busy" | "error">("loading");
  const [confirmOff, setConfirmOff] = useState(false);
  const endpoint = functionEndpoint("health-import");
  const auth = functionAuthHeader();

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchPhoneToken(TABLE)
      .then((t) => {
        if (cancelled) return;
        setToken(t);
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  const act = async (fn: () => Promise<PhoneToken | null>) => {
    setState("busy");
    try {
      setToken(await fn());
      setState("ready");
    } catch (err) {
      console.error("health import token action failed", err);
      setState("error");
    }
  };

  const subtitle = isDemoData ? undefined : state === "loading" ? undefined : token ? "On" : "Off";
  const link = token && endpoint ? `${endpoint}?token=${encodeURIComponent(token.token)}` : "";

  return (
    <CollapsibleManageCard title="Apple Health" subtitle={subtitle} forceOpen={searchQuery.trim().length > 0} bare>
      {isDemoData || !endpoint || !auth ? (
        <FormGroup footer="Sign in to bring your walking time in from Apple Health.">
          <div className="flex min-h-11 items-center px-3.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            Walking from Apple Health
          </div>
        </FormGroup>
      ) : !token ? (
        <FormGroup footer="Your iPhone sends each day's walking minutes to Workout → Walking, so you don't type them in.">
          <button
            type="button"
            onClick={() => void act(() => regeneratePhoneToken(TABLE))}
            disabled={state === "busy" || state === "loading"}
            className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium disabled:opacity-50"
            style={{ color: "var(--ui-accent)" }}
          >
            Set up Apple Health import
          </button>
        </FormGroup>
      ) : (
        <>
          <FormGroup>
            <div className="flex min-h-11 items-center justify-between gap-3 px-3.5 text-sm">
              <span style={{ color: "var(--text-primary)" }}>Last import</span>
              <span style={{ color: "var(--text-secondary)" }}>{lastImport(token)}</span>
            </div>
          </FormGroup>

          <FormGroup title="For the shortcut" footer="The link carries your private key. Don't share it.">
            <CopyRow label="Link" value={link} />
            <CopyRow label="Authorization" value={auth} />
          </FormGroup>

          <FormGroup title="On your iPhone" footer="It then runs every evening on its own. Re-running it the same day replaces that day's value.">
            <Step n={1}>Shortcuts → Automation → + → Time of Day → 23:00, Daily, Run Immediately.</Step>
            <Step n={2}>
              Add <strong>Find Health Samples</strong>: Type is Workouts, Workout Type is Walking, Start Date is Today.
            </Step>
            <Step n={3}>
              Add <strong>Get Details of Health Sample</strong> → Duration, then <strong>Calculate Statistics</strong> → Sum.
            </Step>
            <Step n={4}>
              Add <strong>Get Contents of URL</strong> with the Link above, Method POST, header Authorization.
            </Step>
            <Step n={5}>
              Request Body JSON: <code>minutes</code> = the Sum (in minutes), <code>date</code> = Current Date formatted as{" "}
              <code>yyyy-MM-dd</code>.
            </Step>
          </FormGroup>

          {state === "error" && (
            <p className="px-3.5 text-xs" style={{ color: "var(--status-critical)" }}>
              That didn&apos;t work — try again.
            </p>
          )}

          <FormGroup footer="A new key stops the old shortcut until you paste the new link.">
            <button
              type="button"
              onClick={() => void act(() => regeneratePhoneToken(TABLE))}
              disabled={state === "busy"}
              className="flex min-h-11 w-full items-center px-3.5 text-left text-sm disabled:opacity-50"
              style={{ color: "var(--ui-accent)" }}
            >
              New key
            </button>
            <button
              type="button"
              onClick={() => setConfirmOff(true)}
              disabled={state === "busy"}
              className="flex min-h-11 w-full items-center px-3.5 text-left text-sm disabled:opacity-50"
              style={{ color: "var(--status-critical)" }}
            >
              Turn off
            </button>
          </FormGroup>

          {confirmOff && (
            <ConfirmDialog
              title="Turn off Apple Health import?"
              message="The shortcut stops working. Walks already imported stay in your log."
              confirmLabel="Turn off"
              destructive
              onConfirm={() => {
                setConfirmOff(false);
                void act(() => deletePhoneToken(TABLE).then(() => null));
              }}
              onClose={() => setConfirmOff(false)}
            />
          )}
        </>
      )}
    </CollapsibleManageCard>
  );
}
