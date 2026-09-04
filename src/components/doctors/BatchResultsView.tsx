"use client";

import { useMemo, useState } from "react";
import { useLabs } from "@/lib/useLabs";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { LabMarker, NewLabResultInput } from "@/lib/supabase/labs";
import { FIELD_CLS, FIELD_STYLE, LABEL_CLS, LABEL_STYLE } from "./shared";
import { parseNum, rangeStatus, statusColor } from "./labStatus";

const ALL = "all";
const OTHER = "__other__";

function refLabel(m: LabMarker): string | null {
  const { refLow: low, refHigh: high, unit } = m;
  if (low == null && high == null) return null;
  const u = unit ? ` ${unit}` : "";
  if (low != null && high != null) return `${low}–${high}${u}`;
  if (low != null) return `≥ ${low}${u}`;
  return `≤ ${high}${u}`;
}

/** Enter a whole blood draw in one pass: one date and lab for the batch,
 * then a value beside each marker you have. Only the filled rows are
 * saved. */
export function BatchResultsView({
  labs,
  accent,
  onDone,
}: {
  labs: ReturnType<typeof useLabs>;
  accent: string;
  onDone: (summary: { count: number; date: string } | null) => void;
}) {
  const [date, setDate] = useState(todayLocalISODate());
  const [lab, setLab] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [panelFilter, setPanelFilter] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const byPanel = new Map<string, LabMarker[]>();
    for (const m of labs.markers.data) {
      const key = m.panelId ?? "";
      byPanel.set(key, [...(byPanel.get(key) ?? []), m]);
    }
    const sections = labs.panels.data.map((p) => ({ id: p.id, name: p.name, markers: byPanel.get(p.id) ?? [] }));
    return { sections, ungrouped: byPanel.get("") ?? [] };
  }, [labs.markers.data, labs.panels.data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (m: LabMarker) => !q || m.name.toLowerCase().includes(q);
    const sections = grouped.sections
      .filter((s) => panelFilter === ALL || panelFilter === s.id)
      .map((s) => ({ ...s, markers: s.markers.filter(match) }))
      .filter((s) => s.markers.length > 0);
    const ungrouped =
      panelFilter === ALL || panelFilter === OTHER ? grouped.ungrouped.filter(match) : [];
    return { sections, ungrouped };
  }, [grouped, panelFilter, query]);

  const inputs = useMemo<NewLabResultInput[]>(() => {
    const list: NewLabResultInput[] = [];
    for (const [markerId, raw] of Object.entries(values)) {
      const parsed = parseNum(raw);
      if (parsed == null) continue;
      if (!labs.markers.data.some((m) => m.id === markerId)) continue;
      list.push({ markerId, measuredOn: date, value: parsed, lab, note: "" });
    }
    return list;
  }, [values, date, lab, labs.markers.data]);

  const canSave = inputs.length > 0 && date.length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await labs.results.addMany(inputs);
      onDone({ count: inputs.length, date });
    } catch (err) {
      console.error("batch lab results save failed", err);
      setError("Couldn't save those — try again in a moment.");
      setSaving(false);
    }
  }

  const chips: { id: string; label: string }[] = [
    { id: ALL, label: "All" },
    ...grouped.sections.map((s) => ({ id: s.id, label: s.name })),
    ...(grouped.ungrouped.length > 0 ? [{ id: OTHER, label: "Other" }] : []),
  ];

  const saveButton = (
    <button
      type="button"
      onClick={save}
      disabled={!canSave}
      className="rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: accent }}
    >
      {saving
        ? "Saving…"
        : inputs.length === 0
          ? "Save"
          : `Save ${inputs.length} ${inputs.length === 1 ? "value" : "values"}`}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Add results
          </h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            One date and lab for the batch — fill a value beside each marker you have.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="shrink-0 text-xs font-medium underline decoration-dotted"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-36 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Date</span>
          <input
            type="date"
            value={date}
            max={todayLocalISODate()}
            onChange={(e) => setDate(e.target.value)}
            className={FIELD_CLS}
            style={FIELD_STYLE}
          />
        </label>
        <label className="flex min-w-36 flex-1 flex-col gap-1">
          <span className={LABEL_CLS} style={LABEL_STYLE}>Lab (optional)</span>
          <input
            value={lab}
            onChange={(e) => setLab(e.target.value)}
            placeholder="Where it was done"
            maxLength={80}
            className={FIELD_CLS}
            style={FIELD_STYLE}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {chips.length > 2 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => {
              const active = panelFilter === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPanelFilter(c.id)}
                  aria-pressed={active}
                  className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    borderColor: active ? accent : "var(--border-hairline)",
                    background: active ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
                    color: active ? accent : "var(--text-muted)",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search markers"
          className={FIELD_CLS}
          style={FIELD_STYLE}
        />
      </div>

      <div className="flex items-center gap-3">
        {saveButton}
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>

      {visible.sections.length === 0 && visible.ungrouped.length === 0 ? (
        <p className="py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          No markers match. Add markers first, or clear the filter.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.sections.map((s) => (
            <MarkerGroup key={s.id} title={s.name} markers={s.markers} accent={accent} date={date} values={values} setValues={setValues} />
          ))}
          {visible.ungrouped.length > 0 && (
            <MarkerGroup
              title={grouped.sections.length > 0 ? "Other" : "Markers"}
              markers={visible.ungrouped}
              accent={accent}
              date={date}
              values={values}
              setValues={setValues}
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {saveButton}
        {error && <span className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</span>}
      </div>
    </div>
  );
}

function MarkerGroup({
  title,
  markers,
  accent,
  date,
  values,
  setValues,
}: {
  title: string;
  markers: LabMarker[];
  accent: string;
  date: string;
  values: Record<string, string>;
  setValues: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  return (
    <section className="flex flex-col rounded-lg border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: "var(--border-hairline)" }}>
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: accent }}>{title}</h3>
        <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>{markers.length}</span>
      </div>
      <div className="px-3">
        {markers.map((m) => {
          const raw = values[m.id] ?? "";
          const parsed = parseNum(raw);
          const status = parsed != null ? rangeStatus(parsed, m.refLow, m.refHigh) : null;
          const ref = refLabel(m);
          const dupe = m.results.some((r) => r.measuredOn === date);
          return (
            <div key={m.id} className="flex items-center gap-3 border-t py-2 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(status) }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{m.name}</span>
                {ref && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Ref {ref}</span>}
                {dupe && raw.trim() !== "" && (
                  <span className="block text-xs" style={{ color: "var(--status-warning)" }}>Already has a value on this date</span>
                )}
              </div>
              <input
                value={raw}
                onChange={(e) => setValues((prev) => ({ ...prev, [m.id]: e.target.value }))}
                inputMode="decimal"
                aria-label={`${m.name} value`}
                placeholder={m.unit ?? "value"}
                className="w-24 shrink-0 rounded-lg border px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-[color:var(--baseline)]"
                style={FIELD_STYLE}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
