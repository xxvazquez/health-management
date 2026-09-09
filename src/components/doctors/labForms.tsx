"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { useLabs } from "@/lib/useLabs";
import type { LabMarker } from "@/lib/supabase/labs";
import { Button } from "@/components/ui/Button";
import { ComboBox, FIELD_CLS, FIELD_STYLE, LABEL_CLS, LABEL_STYLE } from "./shared";
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
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border p-4"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {initial ? "Edit marker" : "New marker"}
        </h3>
        <button type="button" onClick={onCancel} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className={LABEL_CLS} style={LABEL_STYLE}>Marker</span>
        <ComboBox value={name} onChange={setName} options={markerNameOptions} placeholder="Search or add a marker…" accent={accent} />
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-28 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Unit</span>
          <input
            value={effectiveUnit}
            onChange={(e) => {
              setUnitTouched(true);
              setUnit(e.target.value);
            }}
            placeholder="mIU/L"
            maxLength={20}
            className={FIELD_CLS}
            style={FIELD_STYLE}
          />
        </label>
        {showRanges && (
          <>
            <label className="flex min-w-24 flex-1 flex-col gap-1">
              <span className={LABEL_CLS} style={LABEL_STYLE}>Ref. low</span>
              <input value={refLow} onChange={(e) => setRefLow(e.target.value)} inputMode="decimal" placeholder="0.4" className={FIELD_CLS} style={FIELD_STYLE} />
            </label>
            <label className="flex min-w-24 flex-1 flex-col gap-1">
              <span className={LABEL_CLS} style={LABEL_STYLE}>Ref. high</span>
              <input value={refHigh} onChange={(e) => setRefHigh(e.target.value)} inputMode="decimal" placeholder="4.0" className={FIELD_CLS} style={FIELD_STYLE} />
            </label>
          </>
        )}
      </div>

      {showRanges && (
        <div className="flex flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Optimal range · optional</span>
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-24 flex-1 flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Low</span>
              <input value={optLow} onChange={(e) => setOptLow(e.target.value)} inputMode="decimal" placeholder="1.0" className={FIELD_CLS} style={FIELD_STYLE} />
            </label>
            <label className="flex min-w-24 flex-1 flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>High</span>
              <input value={optHigh} onChange={(e) => setOptHigh(e.target.value)} inputMode="decimal" placeholder="2.5" className={FIELD_CLS} style={FIELD_STYLE} />
            </label>
          </div>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            The band you want to sit in — the Results overview reads values against this, not just the lab range.
          </span>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS} style={LABEL_STYLE}>Panel</span>
        <select value={panelId} onChange={(e) => setPanelId(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE}>
          <option value={NO_PANEL}>No panel</option>
          {labs.panels.data.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          <option value={NEW_PANEL}>＋ New panel…</option>
        </select>
        {needsNewPanel && (
          <input value={newPanelName} onChange={(e) => setNewPanelName(e.target.value)} placeholder="New panel name" maxLength={60} className={`${FIELD_CLS} mt-1`} style={FIELD_STYLE} />
        )}
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" accent={accent} disabled={!canSave || saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add marker"}
        </Button>
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </form>
  );
}
