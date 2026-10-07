"use client";

import { useEffect, useState } from "react";
import { CopyRow, Step } from "@/components/ui/ShortcutSetup";
import { CollapsibleManageCard } from "@/components/manage/ManageSection";
import { FormGroup } from "@/components/ui/FormGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deletePhoneToken, fetchPhoneToken, functionAuthHeader, functionEndpoint, regeneratePhoneToken, type PhoneToken } from "@/lib/supabase/phoneTokens";

const TABLE = "health_import_tokens";

function lastImport(token: PhoneToken | null): string {
  if (!token?.lastUsedAt) return "Not yet";
  return new Date(token.lastUsedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Settings → Workout → Apple Health: a nightly iOS Shortcut sends the day's
 * walking minutes, steps, weight and blood pressure from Apple Health to the
 * health-import Edge Function, which saves them as that day's Walking and
 * Steps entries and Vitals readings. */
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
        <FormGroup footer="Sign in to bring walking, steps, weight and blood pressure in from Apple Health.">
          <div className="flex min-h-11 items-center px-3.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            Walking, steps, weight, blood pressure
          </div>
        </FormGroup>
      ) : !token ? (
        <FormGroup footer="Your iPhone sends each day's walking time and steps to Workout, and weight and blood pressure to Health → Vitals.">
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

          <FormGroup title="On your iPhone" footer="Leave out anything you don't track. It runs every evening; a re-run the same day replaces that day's values.">
            <Step n={1}>Shortcuts → Automation → + → Time of Day → 23:00, Daily, Run Immediately.</Step>
            <Step n={2}>
              Walking: <strong>Find Health Samples</strong> (Workouts, Walking, today) → Duration → <strong>Calculate Statistics</strong> → Sum.
            </Step>
            <Step n={3}>
              Steps: <strong>Find Health Samples</strong> (Steps, today) → <strong>Calculate Statistics</strong> → Sum.
            </Step>
            <Step n={4}>
              Weight, Systolic, Diastolic: <strong>Find Health Samples</strong> (today, latest first, Limit 1) for each.
            </Step>
            <Step n={5}>
              Add <strong>Get Contents of URL</strong> with the Link above, Method POST, header Authorization.
            </Step>
            <Step n={6}>
              Request Body JSON, Number fields: <code>minutes</code>, <code>steps</code>, <code>weight</code> (kg), <code>systolic</code>,{" "}
              <code>diastolic</code>; Text <code>date</code> = Current Date as <code>yyyy-MM-dd</code>.
            </Step>
          </FormGroup>

          <FormGroup title="Past steps" footer="A separate shortcut, run once. Up to 400 days per run; re-running replaces those days.">
            <Step n={1}>
              <strong>Find Health Samples</strong> (Steps, Start Date is in the last 1 year, Group By Day).
            </Step>
            <Step n={2}>
              <strong>Repeat with Each</strong> sample, and inside it: <strong>Get Start Date from Repeat Item</strong>, then{" "}
              <strong>Format Date</strong> (Custom, <code>yyyy-MM-dd</code>).
            </Step>
            <Step n={3}>
              Still inside: <strong>Get Value from Repeat Item</strong>.
            </Step>
            <Step n={4}>
              Still inside: <strong>Text</strong> <code>{'{"date":"Formatted Date","steps":"Value"}'}</code> with the two variables in place of the words,
              then <strong>Add to Variable</strong> Days.
            </Step>
            <Step n={5}>
              After End Repeat: <strong>Combine Text</strong> Days with Custom <code>,</code>.
            </Step>
            <Step n={6}>
              <strong>Get Contents of URL</strong> with the Link, Method POST, header Authorization, Request Body <strong>File</strong> = Combined Text.
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
              message="The shortcut stops working. Everything already imported stays."
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
