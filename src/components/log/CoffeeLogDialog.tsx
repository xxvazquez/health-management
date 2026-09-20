"use client";

import { Chip as BaseChip } from "@/components/ui/Chip";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { Button } from "@/components/ui/Button";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { TimeField } from "@/components/ui/TimeField";
import { defaultLogTimeValue } from "@/lib/logCandidates";
import type { ResolvedCoffeeOptions } from "@/lib/useCoffeeOptions";
import type { CoffeeItem, CoffeeLog } from "@/lib/supabase/coffee";

export interface CoffeeLogDraft {
  cafe: string;
  price: number | null;
  brewingType: string | null;
  brewingMethod: string | null;
  waterTempC: number | null;
  characteristics: string[];
  note: string;
  loggedAtTime: string;
}

function blankDraft(): CoffeeLogDraft {
  return { cafe: "", price: null, brewingType: null, brewingMethod: null, waterTempC: null, characteristics: [], note: "", loggedAtTime: defaultLogTimeValue() };
}

function draftFromLog(log: CoffeeLog): CoffeeLogDraft {
  const d = new Date(log.loggedAt);
  return {
    cafe: log.cafe ?? "",
    price: log.price,
    brewingType: log.brewingType,
    brewingMethod: log.brewingMethod,
    waterTempC: log.waterTempC,
    characteristics: log.characteristics,
    note: log.note ?? "",
    loggedAtTime: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

/** Wrapping row of natural-width chips for every "pick one or many" field. */
const PICK_GRID = "flex flex-wrap gap-1.5";

function PickChip({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent: string }) {
  return (
    <BaseChip active={active} accent={accent} onClick={onClick}>
      {label}
    </BaseChip>
  );
}

export function CoffeeLogDialog({
  open,
  onClose,
  item,
  options,
  currency,
  editingLog,
  accent,
  isDemoData,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  item: CoffeeItem | null;
  options: ResolvedCoffeeOptions;
  currency: string;
  /** Non-null while editing an already-logged cup; the draft seeds from it. */
  editingLog: CoffeeLog | null;
  accent: string;
  isDemoData: boolean;
  onSave: (draft: CoffeeLogDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CoffeeLogDraft>(blankDraft);
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(editingLog ? draftFromLog(editingLog) : blankDraft());
  }

  if (!open || !item) return null;

  function toggleCharacteristic(label: string) {
    setDraft((d) => ({ ...d, characteristics: d.characteristics.includes(label) ? d.characteristics.filter((c) => c !== label) : [...d.characteristics, label] }));
  }

  async function handleSave() {
    if (saving || isDemoData) return;
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={item.name}
      titleId="coffee-log-title"
      onClose={onClose}
      subtitle={
        item.brand && (
          <span className="text-xs font-medium" style={{ color: accent }}>
            {item.brand}
          </span>
        )
      }
    >
      <FormGroup>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3.5">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            Time
          </span>
          <TimeField
            value={draft.loggedAtTime}
            onChange={(t) => setDraft((d) => ({ ...d, loggedAtTime: t }))}
            onReset={() => setDraft((d) => ({ ...d, loggedAtTime: defaultLogTimeValue() }))}
            collapsible
          />
        </div>
        <Field label="Café · optional" inline>
          <input
            value={draft.cafe}
            onChange={(e) => setDraft((d) => ({ ...d, cafe: e.target.value }))}
            placeholder="Home"
            className={`${ROW_INLINE_CLS} w-40`}
            style={ROW_STYLE}
          />
        </Field>
      </FormGroup>

      <FormGroup title="Brewing type">
        <div className={`${PICK_GRID} px-3.5 py-3`}>
          {options.brewingType.map((t) => (
            <PickChip key={t} label={t} active={draft.brewingType === t} onClick={() => setDraft((d) => ({ ...d, brewingType: d.brewingType === t ? null : t }))} accent={accent} />
          ))}
        </div>
      </FormGroup>

      <FormGroup title="Brewing method">
        <div className={`${PICK_GRID} px-3.5 py-3`}>
          {options.brewingMethod.map((m) => (
            <PickChip key={m} label={m} active={draft.brewingMethod === m} onClick={() => setDraft((d) => ({ ...d, brewingMethod: d.brewingMethod === m ? null : m }))} accent={accent} />
          ))}
        </div>
      </FormGroup>

      <FormGroup title="Characteristics · optional">
        <div className={`${PICK_GRID} px-3.5 py-3`}>
          {options.characteristic.map((c) => (
            <PickChip key={c} label={c} active={draft.characteristics.includes(c)} onClick={() => toggleCharacteristic(c)} accent={accent} />
          ))}
        </div>
      </FormGroup>

      <FormGroup>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3.5">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            Water temp · optional
          </span>
          <NumberStepper
            value={draft.waterTempC ?? 94}
            onChange={(v) => setDraft((d) => ({ ...d, waterTempC: v }))}
            unit="°C"
            accent={accent}
            step={5}
            bigStep={10}
            min={60}
            max={100}
            compact
          />
        </div>
        <Field label="Price · optional" inline>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={draft.price ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value === "" ? null : Number(e.target.value) }))}
            placeholder="0"
            className={`${ROW_INLINE_CLS} w-20 tabular-nums`}
            style={ROW_STYLE}
          />
          <span className="shrink-0 text-sm" style={{ color: "var(--text-muted)" }}>
            {currency}
          </span>
        </Field>
        <Field label="Notes · optional">
          <AutoGrowTextarea
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            rows={2}
            maxRows={6}
            placeholder="Bloomed 30s, a little under-extracted…"
            className={`${ROW_TEXT_CLS} resize-none leading-relaxed`}
            style={ROW_STYLE}
          />
        </Field>
      </FormGroup>

      <Button type="button" size="lg" accent={accent} disabled={saving || isDemoData} onClick={() => void handleSave()}>
        {isDemoData ? "Sign in to log" : saving ? "Saving…" : editingLog ? "Update log" : "Save log"}
      </Button>
    </Sheet>
  );
}
