"use client";

import { Chip as BaseChip } from "@/components/ui/Chip";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { useDialogA11y } from "@/components/ui/useDialogA11y";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/icons";
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

/** Same equal-width pill grid as Stool's picker chips, so every "pick one
 * or many" field across the app aligns the same way instead of wrapping
 * ragged, differently-sized pills. */
const PICK_GRID = "grid grid-cols-2 gap-1.5";

function PickChip({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent: string }) {
  return (
    <BaseChip active={active} accent={accent} block onClick={onClick}>
      {label}
    </BaseChip>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
      {children}
    </span>
  );
}

function Optional() {
  return (
    <span className="font-normal" style={{ color: "var(--text-muted)" }}>
      {" "}
      · optional
    </span>
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

  const containerRef = useDialogA11y(open, onClose);

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
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="coffee-log-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative flex w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl border p-5 shadow-xl"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", maxHeight: "90vh" }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <h2 id="coffee-log-title" className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {item.name}
            </h2>
            {item.brand && (
              <span className="text-xs font-medium" style={{ color: accent }}>
                {item.brand}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--text-secondary)", background: "var(--page-plane)" }}
          >
            <CloseIcon />
          </button>
        </div>

        <TimeField value={draft.loggedAtTime} onChange={(t) => setDraft((d) => ({ ...d, loggedAtTime: t }))} onReset={() => setDraft((d) => ({ ...d, loggedAtTime: defaultLogTimeValue() }))} collapsible />

        <label className="flex flex-col gap-1.5">
          <FieldLabel>
            Café
            <Optional />
          </FieldLabel>
          <input
            value={draft.cafe}
            onChange={(e) => setDraft((d) => ({ ...d, cafe: e.target.value }))}
            placeholder="Home"
            className="rounded-[10px] px-3 py-2 text-sm outline-none"
            style={{ background: "var(--field-fill)", color: "var(--text-primary)" }}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>Brewing type</FieldLabel>
          <div className={PICK_GRID}>
            {options.brewingType.map((t) => (
              <PickChip key={t} label={t} active={draft.brewingType === t} onClick={() => setDraft((d) => ({ ...d, brewingType: d.brewingType === t ? null : t }))} accent={accent} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>Brewing method</FieldLabel>
          <div className={PICK_GRID}>
            {options.brewingMethod.map((m) => (
              <PickChip key={m} label={m} active={draft.brewingMethod === m} onClick={() => setDraft((d) => ({ ...d, brewingMethod: d.brewingMethod === m ? null : m }))} accent={accent} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>
            Characteristics
            <span className="font-normal" style={{ color: "var(--text-muted)" }}>
              {" "}
              · optional, tap all that apply
            </span>
          </FieldLabel>
          <div className={PICK_GRID}>
            {options.characteristic.map((c) => (
              <PickChip key={c} label={c} active={draft.characteristics.includes(c)} onClick={() => toggleCharacteristic(c)} accent={accent} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <FieldLabel>
              Water temp
              <Optional />
            </FieldLabel>
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
          <label className="flex flex-col gap-1.5">
            <FieldLabel>
              Price
              <Optional />
            </FieldLabel>
            <div
              className="flex h-7 items-center gap-1.5 rounded-md px-2.5"
              style={{ background: `color-mix(in oklab, ${accent} 12%, var(--surface-1))` }}
            >
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={draft.price ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value === "" ? null : Number(e.target.value) }))}
                placeholder="0"
                className={clsx("w-full bg-transparent text-xs font-semibold outline-none")}
                style={{ color: "var(--text-primary)" }}
              />
              <span className="shrink-0 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {currency}
              </span>
            </div>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <FieldLabel>
            Notes
            <Optional />
          </FieldLabel>
          <AutoGrowTextarea
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            rows={2}
            maxRows={6}
            placeholder="Bloomed 30s, a little under-extracted…"
            className="resize-none rounded-[10px] px-3 py-2 text-sm outline-none"
            style={{ background: "var(--field-fill)", color: "var(--text-primary)" }}
          />
        </label>

        <Button type="button" size="lg" accent={accent} disabled={saving || isDemoData} className="self-start" onClick={() => void handleSave()}>
          {isDemoData ? "Sign in to log" : saving ? "Saving…" : editingLog ? "Update log" : "Save log"}
        </Button>
      </div>
    </div>
  );
}
