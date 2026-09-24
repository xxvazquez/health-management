"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { useLabs } from "@/lib/useLabs";
import type { LabMarker } from "@/lib/supabase/labs";
import { ComboBox } from "./shared";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { FormShell } from "@/components/ui/FormShell";
import { ROW_INLINE_CLS, ROW_STYLE } from "@/components/ui/formField";
import { parseNum } from "./labStatus";

const NEW_PANEL = "__new__";
const NO_PANEL = "";

/** Create or edit a lab marker. `fields="basic"` drops the reference and
 * optimal range inputs — used by the quick-add on the Results tab, where a
 * marker is created mid-draw and its ranges are set later in Settings.
 * `fields="all"` (the default, used in Settings) shows everything. */
export function MarkerForm({
  labs,
  accent,
  initial,
  fields = "all",
  onSaved,
  onCancel,
}: {
  labs: ReturnType<typeof useLabs>;
  accent: string;
  initial?: LabMarker;
  fields?: "all" | "basic";
  onSaved: (markerId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [unitTouched, setUnitTouched] = useState(false);
  const [refLow, setRefLow] = useState(initial?.refLow != null ? String(initial.refLow) : "");
  const [refHigh, setRefHigh] = useState(initial?.refHigh != null ? String(initial.refHigh) : "");
  const [optLow, setOptLow] = useState(initial?.optimalLow != null ? String(initial.optimalLow) : "");
  const [optHigh, setOptHigh] = useState(initial?.optimalHigh != null ? String(initial.optimalHigh) : "");
  const [panelId, setPanelId] = useState(initial?.panelId ?? NO_PANEL);
  const [newPanelName, setNewPanelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showRanges = fields === "all";
  const needsNewPanel = panelId === NEW_PANEL;
  const markerNameOptions = useMemo(() => labs.markers.data.map((m) => m.name), [labs.markers.data]);

  // Default the Unit field to whatever a marker of the same name already
  // uses, so a brand-new marker doesn't start blank when its unit is
  // already known — a derived fallback, not synced state, so it never
  // fights typing. `unitTouched` (not "is unit empty") gates the fallback,
  // so backspacing the suggestion all the way to blank actually stays blank
  // instead of snapping back to the match on every keystroke.
  const matchedUnit = useMemo(() => {
    if (initial) return null;
    const match = labs.markers.data.find((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());
    return match?.unit || null;
  }, [name, initial, labs.markers.data]);
  const effectiveUnit = unitTouched ? unit : (matchedUnit ?? unit);

  const canSave = name.trim().length > 0 && (!needsNewPanel || newPanelName.trim().length > 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      let resolvedPanelId: string | null = panelId === NO_PANEL || needsNewPanel ? null : panelId;
      if (needsNewPanel) resolvedPanelId = (await labs.panels.create(newPanelName)).id;
      const patch = {
        panelId: resolvedPanelId,
        name,
        unit: effectiveUnit,
        refLow: showRanges ? parseNum(refLow) : (initial?.refLow ?? null),
        refHigh: showRanges ? parseNum(refHigh) : (initial?.refHigh ?? null),
        optimalLow: showRanges ? parseNum(optLow) : (initial?.optimalLow ?? null),
        optimalHigh: showRanges ? parseNum(optHigh) : (initial?.optimalHigh ?? null),
      };
      if (initial) {
        await labs.markers.edit(initial.id, patch);
        onSaved(initial.id);
      } else {
        const created = await labs.markers.create(patch);
        onSaved(created.id);
      }
    } catch (err) {
      console.error("lab marker save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <FormShell title={initial ? "Edit marker" : "New marker"} onSubmit={handleSubmit} onCancel={onCancel} submitLabel={initial ? "Done" : "Add"} submitDisabled={!canSave || saving} busy={saving} accent={accent}>
      <FormGroup>
        <Field label="Marker" plain>
          <ComboBox bare value={name} onChange={setName} options={markerNameOptions} placeholder="Search or add a marker…" accent={accent} />
        </Field>
        <Field label="Unit" inline>
          <input
            value={effectiveUnit}
            onChange={(e) => {
              setUnitTouched(true);
              setUnit(e.target.value);
            }}
            placeholder="mIU/L"
            maxLength={20}
            className={`${ROW_INLINE_CLS} w-28`}
            style={ROW_STYLE}
          />
        </Field>
        <Field label="Panel" inline>
          <select value={panelId} onChange={(e) => setPanelId(e.target.value)} className={ROW_INLINE_CLS} style={ROW_STYLE}>
            <option value={NO_PANEL}>No panel</option>
            {labs.panels.data.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value={NEW_PANEL}>＋ New panel…</option>
          </select>
        </Field>
        {needsNewPanel && (
          <Field label="New panel name" inline>
            <input value={newPanelName} onChange={(e) => setNewPanelName(e.target.value)} placeholder="Name" maxLength={60} className={`${ROW_INLINE_CLS} w-40`} style={ROW_STYLE} />
          </Field>
        )}
      </FormGroup>

      {showRanges && (
        <>
          <FormGroup title="Lab reference range">
            <Field label="Low" inline>
              <input value={refLow} onChange={(e) => setRefLow(e.target.value)} inputMode="decimal" placeholder="0.4" className={`${ROW_INLINE_CLS} w-24`} style={ROW_STYLE} />
            </Field>
            <Field label="High" inline>
              <input value={refHigh} onChange={(e) => setRefHigh(e.target.value)} inputMode="decimal" placeholder="4.0" className={`${ROW_INLINE_CLS} w-24`} style={ROW_STYLE} />
            </Field>
          </FormGroup>
          <FormGroup
            title="Optimal range · optional"
            footer="The band you want to sit in — the Results overview reads values against this, not just the lab range."
          >
            <Field label="Low" inline>
              <input value={optLow} onChange={(e) => setOptLow(e.target.value)} inputMode="decimal" placeholder="1.0" className={`${ROW_INLINE_CLS} w-24`} style={ROW_STYLE} />
            </Field>
            <Field label="High" inline>
              <input value={optHigh} onChange={(e) => setOptHigh(e.target.value)} inputMode="decimal" placeholder="2.5" className={`${ROW_INLINE_CLS} w-24`} style={ROW_STYLE} />
            </Field>
          </FormGroup>
        </>
      )}

      <div className="flex items-center gap-3">
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </FormShell>
  );
}
