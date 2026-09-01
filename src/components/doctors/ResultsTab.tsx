"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLabs } from "@/lib/useLabs";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { LabMarker, LabResult } from "@/lib/supabase/labs";
import { LabMarkerChart, LabSparkline } from "@/components/charts/LabMarkerChart";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { FIELD_CLS, FIELD_STYLE, IconAction, LABEL_CLS, LABEL_STYLE, PencilIcon, TrashIcon, formatDate } from "./shared";

const NEW_PANEL = "__new__";
const NO_PANEL = "";

type RangeStatus = "low" | "in" | "high" | null;

function rangeStatus(value: number, low: number | null, high: number | null): RangeStatus {
  if (low == null && high == null) return null;
  if (low != null && value < low) return "low";
  if (high != null && value > high) return "high";
  return "in";
}

function statusColor(status: RangeStatus): string {
  if (status === "in") return "var(--status-good)";
  if (status === "low" || status === "high") return "var(--status-warning)";
  return "var(--text-muted)";
}

function refRangeLabel(low: number | null, high: number | null, unit: string | null): string | null {
  if (low == null && high == null) return null;
  const u = unit ? ` ${unit}` : "";
  if (low != null && high != null) return `Ref ${low}–${high}${u}`;
  if (low != null) return `Ref ≥ ${low}${u}`;
  return `Ref ≤ ${high}${u}`;
}

function parseNum(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

// --- Marker form -------------------------------------------------------

function MarkerForm({
  labs,
  accent,
  initial,
  onSaved,
  onCancel,
}: {
  labs: ReturnType<typeof useLabs>;
  accent: string;
  initial?: LabMarker;
  onSaved: (markerId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [refLow, setRefLow] = useState(initial?.refLow != null ? String(initial.refLow) : "");
  const [refHigh, setRefHigh] = useState(initial?.refHigh != null ? String(initial.refHigh) : "");
  const [panelId, setPanelId] = useState(initial?.panelId ?? NO_PANEL);
  const [newPanelName, setNewPanelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsNewPanel = panelId === NEW_PANEL;
  const canSave = name.trim().length > 0 && (!needsNewPanel || newPanelName.trim().length > 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      let resolvedPanelId: string | null = panelId === NO_PANEL || needsNewPanel ? null : panelId;
      if (needsNewPanel) resolvedPanelId = (await labs.panels.create(newPanelName)).id;
      const patch = { panelId: resolvedPanelId, name, unit, refLow: parseNum(refLow), refHigh: parseNum(refHigh) };
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS} style={LABEL_STYLE}>Marker</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TSH, Ferritin" maxLength={80} className={`${FIELD_CLS} font-medium`} style={FIELD_STYLE} />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-28 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Unit</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mIU/L" maxLength={20} className={FIELD_CLS} style={FIELD_STYLE} />
        </label>
        <label className="flex min-w-24 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Ref. low</span>
          <input value={refLow} onChange={(e) => setRefLow(e.target.value)} inputMode="decimal" placeholder="0.4" className={FIELD_CLS} style={FIELD_STYLE} />
        </label>
        <label className="flex min-w-24 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Ref. high</span>
          <input value={refHigh} onChange={(e) => setRefHigh(e.target.value)} inputMode="decimal" placeholder="4.0" className={FIELD_CLS} style={FIELD_STYLE} />
        </label>
      </div>

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
        <button type="submit" disabled={!canSave || saving} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add marker"}
        </button>
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </form>
  );
}

// --- Result form -----------------------------------------------------

function ResultForm({
  labs,
  accent,
  marker,
  initial,
  onDone,
  onCancel,
}: {
  labs: ReturnType<typeof useLabs>;
  accent: string;
  marker: LabMarker;
  initial?: LabResult;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial ? String(initial.value) : "");
  const [measuredOn, setMeasuredOn] = useState(initial?.measuredOn ?? todayLocalISODate());
  const [lab, setLab] = useState(initial?.lab ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseNum(value);
  const canSave = parsed != null && measuredOn.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await labs.results.edit(marker.id, initial.id, { measuredOn, value: parsed as number, lab, note });
      } else {
        await labs.results.add({ markerId: marker.id, measuredOn, value: parsed as number, lab, note });
      }
      onDone();
    } catch (err) {
      console.error("lab result save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {marker.name}
        {marker.unit && <span className="ml-1 font-normal" style={{ color: "var(--text-muted)" }}>({marker.unit})</span>}
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-28 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Value</span>
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="e.g. 2.1" className={`${FIELD_CLS} font-medium`} style={FIELD_STYLE} />
        </label>
        <label className="flex min-w-36 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Date</span>
          <input type="date" value={measuredOn} max={todayLocalISODate()} onChange={(e) => setMeasuredOn(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS} style={LABEL_STYLE}>Lab (optional)</span>
        <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Where it was done" maxLength={80} className={FIELD_CLS} style={FIELD_STYLE} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS} style={LABEL_STYLE}>Note (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Context worth remembering — fasting, medication change…" maxLength={400} className={`${FIELD_CLS} resize-y`} style={FIELD_STYLE} />
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!canSave || saving} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add value"}
        </button>
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </form>
  );
}

// --- Marker detail ---------------------------------------------------

function MarkerDetail({
  labs,
  accent,
  marker,
  onBack,
  onAddValue,
  onEditMarker,
  onEditResult,
}: {
  labs: ReturnType<typeof useLabs>;
  accent: string;
  marker: LabMarker;
  onBack: () => void;
  onAddValue: () => void;
  onEditMarker: () => void;
  onEditResult: (result: LabResult) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingResult, setConfirmingResult] = useState<string | null>(null);

  const latest = marker.results[marker.results.length - 1] ?? null;
  const latestStatus = latest ? rangeStatus(latest.value, marker.refLow, marker.refHigh) : null;
  const chartData = marker.results.map((r) => ({ date: r.measuredOn, value: r.value }));
  const refLabel = refRangeLabel(marker.refLow, marker.refHigh, marker.unit);

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="self-start text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        ← All results
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {marker.name}
          </h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {[marker.unit, refLabel].filter(Boolean).join(" · ") || "No unit or reference range set"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {confirmingDelete ? (
            <>
              <button type="button" onClick={() => void labs.markers.remove(marker.id).then(onBack)} className="text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
                Delete{marker.results.length > 0 ? ` (${marker.results.length})` : ""}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Keep
              </button>
            </>
          ) : (
            <>
              <IconAction onClick={onEditMarker} label="Edit marker"><PencilIcon size={15} /></IconAction>
              <IconAction onClick={() => setConfirmingDelete(true)} label="Delete marker" tone="critical"><TrashIcon size={15} /></IconAction>
            </>
          )}
        </div>
      </div>

      {latest && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Latest:{" "}
          <span className="font-semibold tabular-nums" style={{ color: statusColor(latestStatus) }}>
            {latest.value}
            {marker.unit ? ` ${marker.unit}` : ""}
          </span>{" "}
          <span style={{ color: "var(--text-muted)" }}>· {formatDate(latest.measuredOn)}</span>
          {latestStatus === "low" && <span style={{ color: "var(--status-warning)" }}> · below range</span>}
          {latestStatus === "high" && <span style={{ color: "var(--status-warning)" }}> · above range</span>}
        </p>
      )}

      {marker.results.length >= 2 ? (
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
          <LabMarkerChart data={chartData} unit={marker.unit} refLow={marker.refLow} refHigh={marker.refHigh} color={accent} />
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Add a second value to see the trend.
        </p>
      )}

      <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
        {[...marker.results].reverse().map((r) => {
          const status = rangeStatus(r.value, marker.refLow, marker.refHigh);
          return (
            <li key={r.id} className="flex items-start gap-3 py-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(status) }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {r.value}
                  {marker.unit ? ` ${marker.unit}` : ""}
                </span>
                <span className="ml-2 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{formatDate(r.measuredOn)}</span>
                {(r.lab || r.note) && (
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {[r.lab, r.note].filter(Boolean).join(" — ")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {confirmingResult === r.id ? (
                  <>
                    <button type="button" onClick={() => void labs.results.remove(marker.id, r.id)} className="text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmingResult(null)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <IconAction onClick={() => onEditResult(r)} label="Edit value"><PencilIcon size={14} /></IconAction>
                    <IconAction onClick={() => setConfirmingResult(r.id)} label="Delete value" tone="critical"><TrashIcon size={14} /></IconAction>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onAddValue}
        className="self-start rounded-md px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ background: accent }}
      >
        + Add value
      </button>
    </div>
  );
}

// --- Marker row (list) ----------------------------------------------

function MarkerRow({ marker, onOpen }: { marker: LabMarker; onOpen: () => void }) {
  const latest = marker.results[marker.results.length - 1] ?? null;
  const status = latest ? rangeStatus(latest.value, marker.refLow, marker.refHigh) : null;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 border-t py-2.5 text-left first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(status) }} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {marker.name}
      </span>
      <LabSparkline values={marker.results.map((r) => r.value)} refLow={marker.refLow} refHigh={marker.refHigh} />
      <span className="shrink-0 text-sm tabular-nums" style={{ color: latest ? statusColor(status) : "var(--text-muted)" }}>
        {latest ? `${latest.value}${marker.unit ? ` ${marker.unit}` : ""}` : "—"}
      </span>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true">
        <path d="M7.5 5 12.5 10 7.5 15" />
      </svg>
    </button>
  );
}

// --- Section (panel) ----------------------------------------------

function PanelSection({
  title,
  markers,
  accent,
  editable,
  onOpenMarker,
  onRename,
  onDelete,
}: {
  title: string;
  markers: LabMarker[];
  accent: string;
  editable: boolean;
  onOpenMarker: (m: LabMarker) => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <section className="flex flex-col rounded-lg border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: "var(--border-hairline)" }}>
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: accent }}>
          {title}
        </h3>
        <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>{markers.length}</span>
        {editable && (
          <div className="ml-2 flex shrink-0 items-center gap-2">
            {confirmingDelete ? (
              <>
                <button type="button" onClick={onDelete} className="text-xs font-semibold" style={{ color: "var(--status-critical)" }}>Delete</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Keep</button>
              </>
            ) : (
              <>
                <IconAction onClick={() => onRename?.()} label="Rename panel"><PencilIcon size={13} /></IconAction>
                <IconAction onClick={() => setConfirmingDelete(true)} label="Delete panel" tone="critical"><TrashIcon size={13} /></IconAction>
              </>
            )}
          </div>
        )}
      </div>
      <div className="px-3">
        {markers.length === 0 ? (
          <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>No markers here yet.</p>
        ) : (
          markers.map((m) => <MarkerRow key={m.id} marker={m} onOpen={() => onOpenMarker(m)} />)
        )}
      </div>
    </section>
  );
}

// --- Small name form (panel rename / new) -------------------------

function PanelNameForm({ accent, initialName, onSave, onCancel }: { accent: string; initialName?: string; onSave: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || saving) return;
        setSaving(true);
        try {
          await onSave(name);
        } catch {
          setSaving(false);
        }
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>Cancel</button>
      </div>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Panel name" maxLength={60} className={FIELD_CLS} style={FIELD_STYLE} />
      <button type="submit" disabled={!name.trim() || saving} className="self-start rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
        {saving ? "Saving…" : initialName ? "Rename" : "Add panel"}
      </button>
    </form>
  );
}

// --- Tab -----------------------------------------------------------

type View =
  | { mode: "list" }
  | { mode: "marker"; markerId: string }
  | { mode: "marker-form"; markerId?: string }
  | { mode: "result-form"; markerId: string; resultId?: string }
  | { mode: "panel-form"; panelId?: string };

export function ResultsTab({ accent }: { accent: string }) {
  const labs = useLabs();
  const [view, setView] = useState<View>({ mode: "list" });

  const grouped = useMemo(() => {
    const byPanel = new Map<string, LabMarker[]>();
    for (const m of labs.markers.data) {
      const key = m.panelId ?? "";
      byPanel.set(key, [...(byPanel.get(key) ?? []), m]);
    }
    const sections = labs.panels.data.map((p) => ({ id: p.id, name: p.name, markers: byPanel.get(p.id) ?? [] }));
    const ungrouped = byPanel.get("") ?? [];
    return { sections, ungrouped };
  }, [labs.markers.data, labs.panels.data]);

  const findMarker = (id: string) => labs.markers.data.find((m) => m.id === id) ?? null;

  if (view.mode === "marker-form") {
    return (
      <MarkerForm
        labs={labs}
        accent={accent}
        initial={view.markerId ? findMarker(view.markerId) ?? undefined : undefined}
        onSaved={(markerId) => setView({ mode: "marker", markerId })}
        onCancel={() => setView(view.markerId ? { mode: "marker", markerId: view.markerId } : { mode: "list" })}
      />
    );
  }

  if (view.mode === "result-form") {
    const marker = findMarker(view.markerId);
    if (!marker) return fallbackToList();
    return (
      <ResultForm
        labs={labs}
        accent={accent}
        marker={marker}
        initial={view.resultId ? marker.results.find((r) => r.id === view.resultId) : undefined}
        onDone={() => setView({ mode: "marker", markerId: marker.id })}
        onCancel={() => setView({ mode: "marker", markerId: marker.id })}
      />
    );
  }

  if (view.mode === "panel-form") {
    const panel = view.panelId ? labs.panels.data.find((p) => p.id === view.panelId) : undefined;
    return (
      <PanelNameForm
        accent={accent}
        initialName={panel?.name}
        onSave={async (name) => {
          if (panel) await labs.panels.rename(panel.id, name);
          else await labs.panels.create(name);
          setView({ mode: "list" });
        }}
        onCancel={() => setView({ mode: "list" })}
      />
    );
  }

  if (view.mode === "marker") {
    const marker = findMarker(view.markerId);
    if (!marker) return fallbackToList();
    return (
      <MarkerDetail
        labs={labs}
        accent={accent}
        marker={marker}
        onBack={() => setView({ mode: "list" })}
        onAddValue={() => setView({ mode: "result-form", markerId: marker.id })}
        onEditMarker={() => setView({ mode: "marker-form", markerId: marker.id })}
        onEditResult={(r) => setView({ mode: "result-form", markerId: marker.id, resultId: r.id })}
      />
    );
  }

  return fallbackToList();

  function fallbackToList() {
    const hasAny = labs.markers.data.length > 0 || labs.panels.data.length > 0;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setView({ mode: "panel-form" })}
            className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
          >
            New panel
          </button>
          <PrimaryAction label="New marker" accent={accent} onClick={() => setView({ mode: "marker-form" })} />
        </div>

        {labs.loading ? (
          <ListSkeleton />
        ) : labs.error ? (
          <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
            Couldn&apos;t load your results — try again in a moment.
          </p>
        ) : !hasAny ? (
          <InlineEmpty
            title="No results tracked yet"
            description="Add a marker (TSH, Ferritin, …) with its unit and reference range, then log each value as you get it — the trend builds up over time."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.sections.map((s) => (
              <PanelSection
                key={s.id}
                title={s.name}
                markers={s.markers}
                accent={accent}
                editable
                onOpenMarker={(m) => setView({ mode: "marker", markerId: m.id })}
                onRename={() => setView({ mode: "panel-form", panelId: s.id })}
                onDelete={() => void labs.panels.remove(s.id)}
              />
            ))}
            {grouped.ungrouped.length > 0 && (
              <PanelSection
                title={grouped.sections.length > 0 ? "Other" : "Markers"}
                markers={grouped.ungrouped}
                accent={accent}
                editable={false}
                onOpenMarker={(m) => setView({ mode: "marker", markerId: m.id })}
              />
            )}
          </div>
        )}
      </div>
    );
  }
}
