"use client";

import { useEffect, useState } from "react";
import { CopyRow, FieldRow, GuideRow, Step } from "@/components/ui/ShortcutSetup";
import { Sheet } from "@/components/ui/Sheet";
import { CollapsibleManageCard } from "@/components/manage/ManageSection";
import { FormGroup } from "@/components/ui/FormGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deletePhoneToken, fetchPhoneToken, functionAuthHeader, functionEndpoint, regeneratePhoneToken, type PhoneToken } from "@/lib/supabase/phoneTokens";

const TABLE = "health_import_tokens";

function lastImport(token: PhoneToken | null): string {
  if (!token?.lastUsedAt) return "Not yet";
  return new Date(token.lastUsedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function CopyGroup({ link, auth }: { link: string; auth: string }) {
  return (
    <FormGroup title="Copy" footer="Your link includes your private key. Don't share it.">
      <CopyRow label="Link" value={link} />
      <CopyRow label="Authorization" value={auth} />
    </FormGroup>
  );
}

/** How to build the nightly automation that sends the day's figures. */
function DailyGuide({ link, auth, onClose }: { link: string; auth: string; onClose: () => void }) {
  return (
    <Sheet title="Set Up Shortcut" titleId="health-daily-guide-title" onClose={onClose}>
      <CopyGroup link={link} auth={auth} />
      <FormGroup title="In Shortcuts" footer="Leave out anything you don't track.">
        <Step n={1}>
          Open <strong>Shortcuts</strong>, tap <strong>Automation</strong>, then tap <strong>+</strong>.
        </Step>
        <Step n={2}>
          Choose <strong>Time of Day</strong>, set 23:00, <strong>Daily</strong> and <strong>Run Immediately</strong>, then tap <strong>Next</strong>.
        </Step>
        <Step n={3}>
          Tap <strong>New Blank Automation</strong>.
        </Step>
        <Step n={4}>
          Add <strong>Find Health Samples</strong> for Walking workouts that started today.
        </Step>
        <Step n={5}>
          Add <strong>Calculate Statistics</strong> for the <strong>Sum</strong> of their Duration.
        </Step>
        <Step n={6}>
          Add <strong>Find Health Samples</strong> for today&apos;s Steps, with <strong>Source</strong> set to your iPhone.
        </Step>
        <Step n={7}>
          Add <strong>Calculate Statistics</strong> for their <strong>Sum</strong>. With an Apple Watch, repeat steps 6 and 7 for the Watch.
        </Step>
        <Step n={8}>
          Add <strong>Find Health Samples</strong> for today&apos;s Weight, sorted <strong>Latest First</strong>, <strong>Limit</strong> 1. Do the same for Systolic and
          Diastolic blood pressure.
        </Step>
        <Step n={9}>
          Add <strong>Get Contents of URL</strong>, paste your link as the <strong>URL</strong>, and set <strong>Method</strong> to <strong>POST</strong>.
        </Step>
        <Step n={10}>
          Under <strong>Headers</strong>, add <strong>Authorization</strong> and paste the Authorization value.
        </Step>
        <Step n={11}>
          Set <strong>Request Body</strong> to <strong>JSON</strong>, add the fields below, then tap <strong>Done</strong>.
        </Step>
      </FormGroup>
      <FormGroup title="JSON Fields" footer="Steps from iPhone and Watch are kept apart, so a walk isn't counted twice.">
        <FieldRow name="minutes" value="Number · Walking sum" />
        <FieldRow name="steps" value="Number · iPhone steps sum" />
        <FieldRow name="watchsteps" value="Number · Watch steps sum" />
        <FieldRow name="weight" value="Number · Weight in kg" />
        <FieldRow name="systolic" value="Number · Systolic" />
        <FieldRow name="diastolic" value="Number · Diastolic" />
        <FieldRow name="date" value="Text · Current Date, yyyy-MM-dd" />
      </FormGroup>
    </Sheet>
  );
}

/** How to build the one-off shortcut that sends up to a year of daily steps. */
function PastStepsGuide({ link, auth, onClose }: { link: string; auth: string; onClose: () => void }) {
  return (
    <Sheet title="Import Past Steps" titleId="health-past-guide-title" onClose={onClose}>
      <CopyGroup link={link} auth={auth} />
      <FormGroup title="In Shortcuts" footer="Up to 400 days per run. Running it again replaces those days.">
        <Step n={1}>
          Open <strong>Shortcuts</strong> and tap <strong>+</strong> to make a new shortcut.
        </Step>
        <Step n={2}>
          Add <strong>Find Health Samples</strong> for Steps from the last year, with <strong>Source</strong> set to your iPhone and <strong>Group By</strong> Day.
        </Step>
        <Step n={3}>
          Add <strong>Repeat with Each</strong>.
        </Step>
        <Step n={4}>
          Inside it, add <strong>Get Start Date</strong> from Repeat Item, then <strong>Format Date</strong> with the custom format yyyy-MM-dd.
        </Step>
        <Step n={5}>
          Still inside, add <strong>Get Value</strong> from Repeat Item.
        </Step>
        <Step n={6}>
          Still inside, add <strong>Text</strong>, paste the template below, and swap the two words for the results of steps 4 and 5.
        </Step>
        <Step n={7}>
          Still inside, add <strong>Add to Variable</strong> and name it Days.
        </Step>
        <Step n={8}>
          With an Apple Watch, repeat steps 2–7 below <strong>End Repeat</strong> for the Watch, using watchsteps in place of steps.
        </Step>
        <Step n={9}>
          After the last <strong>End Repeat</strong>, add <strong>Combine Text</strong> for Days with a <strong>Custom</strong> separator of a comma.
        </Step>
        <Step n={10}>
          Add <strong>Get Contents of URL</strong> with your link, <strong>Method</strong> POST and the <strong>Authorization</strong> header.
        </Step>
        <Step n={11}>
          Set <strong>Request Body</strong> to <strong>File</strong>, choose Combined Text, then run the shortcut once.
        </Step>
      </FormGroup>
      <FormGroup title="Text Template" footer="Paste into the Text action in step 6.">
        <CopyRow label="Template" value={'{"date":"Formatted Date","steps":"Value"}'} />
      </FormGroup>
    </Sheet>
  );
}

/** Settings → Workout → Apple Health: a nightly iOS Shortcut sends the day's
 * walking minutes, steps, weight and blood pressure from Apple Health to the
 * health-import Edge Function, which saves them as that day's Walking and
 * Steps entries and Vitals readings. */
export function HealthImportCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const [token, setToken] = useState<PhoneToken | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "busy" | "error">("loading");
  const [confirmOff, setConfirmOff] = useState(false);
  const [guide, setGuide] = useState<"daily" | "past" | null>(null);
  const [confirmNewKey, setConfirmNewKey] = useState(false);
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

  const act = async (fn: () => Promise<PhoneToken | null>): Promise<boolean> => {
    setState("busy");
    try {
      setToken(await fn());
      setState("ready");
      return true;
    } catch (err) {
      console.error("health import token action failed", err);
      setState("error");
      return false;
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
        <FormGroup footer="Walking and steps go to Workout; weight and blood pressure to Vitals.">
          <button
            type="button"
            onClick={() => void act(() => regeneratePhoneToken(TABLE)).then((ok) => ok && setGuide("daily"))}
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

          <FormGroup footer="Runs every night. Import Past Steps fills in earlier days once.">
            <GuideRow label="Set Up Shortcut" onOpen={() => setGuide("daily")} />
            <GuideRow label="Import Past Steps" onOpen={() => setGuide("past")} />
          </FormGroup>
          {guide === "daily" && <DailyGuide link={link} auth={auth} onClose={() => setGuide(null)} />}
          {guide === "past" && <PastStepsGuide link={link} auth={auth} onClose={() => setGuide(null)} />}

          {state === "error" && (
            <p className="px-3.5 text-xs" style={{ color: "var(--status-critical)" }}>
              That didn&apos;t work — try again.
            </p>
          )}

          <FormGroup footer="A new key stops the old shortcut until you paste the new link.">
            <button
              type="button"
              onClick={() => setConfirmNewKey(true)}
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

          {confirmNewKey && (
            <ConfirmDialog
              title="Create a new key?"
              message="Your shortcut stops working until you paste the new link into it."
              confirmLabel="New key"
              onConfirm={() => {
                setConfirmNewKey(false);
                void act(() => regeneratePhoneToken(TABLE)).then((ok) => ok && setGuide("daily"));
              }}
              onClose={() => setConfirmNewKey(false)}
            />
          )}
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
