"use client";

import { useState } from "react";
import { CollapsibleManageCard } from "@/components/manage/ManageSection";
import { FormGroup } from "@/components/ui/FormGroup";
import { SwitchRow } from "@/components/ui/Switch";
import { useJournalLock } from "@/lib/journalLock";
import { usePreferences } from "@/lib/usePreferences";

/** Settings → Journal lock: Face ID / Touch ID / passcode before Journal
 * opens. Switching it either way asks for the same check first. */
export function JournalLockCard({ searchQuery }: { searchQuery: string }) {
  const { prefs } = usePreferences();
  const lock = useJournalLock();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  if (isSearching && !"journal lock face id touch id passcode privacy".includes(query)) return null;

  const on = prefs.journalLock === true;
  const unavailable = lock.available === false;

  async function toggle(next: boolean) {
    if (busy || unavailable) return;
    setBusy(true);
    const ok = await lock.setEnabled(next);
    setBusy(false);
    setFailed(!ok);
  }

  const footer = unavailable
    ? "This device can't lock Journal."
    : failed
      ? "Couldn't confirm it's you, so nothing changed."
      : "Opening Journal asks for Face ID, Touch ID or your passcode.";

  return (
    <CollapsibleManageCard title="Journal lock" subtitle={on ? "On" : "Off"} forceOpen={isSearching} bare>
      <FormGroup footer={footer}>
        <div className={unavailable || busy ? "pointer-events-none opacity-50" : undefined}>
          <SwitchRow label="Lock Journal" on={on} onChange={(next) => void toggle(next)} />
        </div>
      </FormGroup>
    </CollapsibleManageCard>
  );
}
