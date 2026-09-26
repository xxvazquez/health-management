"use client";

import { DatePicker } from "@/components/ui/DatePicker";
import { TabRail } from "@/components/ui/TabRail";
import { useMemo, useState } from "react";
import { useLabs } from "@/lib/useLabs";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { LabMarker, NewLabResultInput } from "@/lib/supabase/labs";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { SearchField } from "@/components/ui/SearchField";
import { ROW_INLINE_CLS, ROW_STYLE } from "@/components/ui/formField";
import { Button } from "@/components/ui/Button";
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
    <Button type="button" size="lg" onClick={save} disabled={!canSave} accent={accent} className="transition-opacity hover:opacity-90">
      {saving
        ? "Saving…"
        : inputs.length === 0
          ? "Save"
          : `Save ${inputs.length} ${inputs.length === 1 ? "value" : "values"}`}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Add results
          </h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            One date and lab for the batch — fill a value beside each marker you have.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="shrink-0 text-sm font-medium"
          style={{ color: accent }}
        >
          Cancel
        </button>
      </div>

      <FormGroup>
        <Field label="Date" inline>
          <DatePicker value={date} onChange={setDate} max={todayLocalISODate()} />
        </Field>
        <Field label="Lab · optional" inline>
          <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Where it was done" maxLength={80} className={`${ROW_INLINE_CLS} w-40`} style={ROW_STYLE} />
        </Field>
      </FormGroup>

      <div className="flex flex-col gap-2">
        {chips.length > 2 && (
          <TabRail
            ariaLabel="Filter by panel"
            wrap={false}
            tall
            style={{ borderColor: "var(--border-hairline)" }}
            items={chips.map((c) => ({ id: c.id, label: c.label, accent }))}
            activeId={panelFilter}
            onSelect={setPanelFilter}
          />
        )}
        <SearchField value={query} onChange={setQuery} placeholder="Search markers" className="w-full" />
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
            <MarkerGroup key={s.id} title={s.name} markers={s.markers} date={date} values={values} setValues={setValues} />
          ))}
          {visible.ungrouped.length > 0 && (
            <MarkerGroup
              title={grouped.sections.length > 0 ? "Other" : "Markers"}
              markers={visible.ungrouped}
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
  date,
  values,
  setValues,
}: {
  title: string;
  markers: LabMarker[];
  date: string;
  values: Record<string, string>;
  setValues: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  return (
    <FormGroup title={<span className="flex items-center justify-between"><span className="truncate">{title}</span><span className="tabular-nums">{markers.length}</span></span>}>
      {markers.map((m) => {
        const raw = values[m.id] ?? "";
        const parsed = parseNum(raw);
        const status = parsed != null ? rangeStatus(parsed, m.refLow, m.refHigh) : null;
        const ref = refLabel(m);
        const dupe = m.results.some((r) => r.measuredOn === date);
        return (
          <div key={m.id} className="flex min-h-11 items-center gap-3 px-3.5 py-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(status) }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm" style={{ color: "var(--text-primary)" }}>{m.name}</span>
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
              className={`${ROW_INLINE_CLS} w-24 shrink-0 tabular-nums`}
              style={ROW_STYLE}
            />
          </div>
        );
      })}
    </FormGroup>
  );
}
