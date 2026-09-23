"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useDialogA11y } from "@/components/ui/useDialogA11y";
import { Calendar, MonthGrid } from "@/components/ui/pickers/Calendar";
import { TimeWheels } from "@/components/ui/pickers/TimeWheels";
import {
  formatDateValue,
  formatMonthValue,
  joinDateTime,
  pad2,
  parseISODate,
  splitDateTime,
  todayISO,
} from "@/components/ui/pickers/dateUtils";

/** The compact value button every picker shows in a row — the iOS "compact
 * date picker": the value in a small grey capsule, muted when empty. */
const TRIGGER_CLS = "control-surface hit-slop inline-flex h-8 max-w-full items-center rounded-lg px-2.5 text-sm tabular-nums transition-opacity active:opacity-60 disabled:opacity-40";

function Trigger({
  display,
  placeholder,
  empty,
  onOpen,
  ariaLabel,
  disabled,
  className,
}: {
  display: string;
  placeholder: string;
  empty: boolean;
  onOpen: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-label={ariaLabel ? `${ariaLabel}: ${empty ? placeholder : display}` : undefined}
      className={`${TRIGGER_CLS} ${className ?? ""}`}
      style={{ color: empty ? "var(--text-muted)" : "var(--text-primary)" }}
    >
      <span className="truncate">{empty ? placeholder : display}</span>
    </button>
  );
}

function PickerActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 px-1">{children}</div>;
}

function ActionButton({ onClick, children, strong }: { onClick: () => void; children: ReactNode; strong?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="min-h-9 text-sm" style={{ color: "var(--ui-accent)", fontWeight: strong ? 600 : 500 }}>
      {children}
    </button>
  );
}

const POPOVER_BREAKPOINT = "(min-width: 640px)";
const POPOVER_MIN_WIDTH = 280;

/** Below `sm`, a picker is `Sheet`'s iOS bottom sheet, same as every other
 * modal. From `sm` up it's a small popover anchored to the trigger instead
 * — a calendar or a couple of wheels doesn't need the whole screen (or a
 * centred backdrop) on a pointer-driven layout, and this matches every
 * other anchored popover in the app (`DateRangeFilter`, the "More" tabs
 * menu). Wraps whatever trigger is passed in, so it works for both the
 * default capsule and a caller's own `renderTrigger`. */
function PickerShell({ trigger, open, onClose, title, titleId, children }: { trigger: ReactNode; open: boolean; onClose: () => void; title: string; titleId: string; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isPopover, setIsPopover] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const panelRef = useDialogA11y(open && isPopover, onClose);

  useEffect(() => {
    const mq = window.matchMedia(POPOVER_BREAKPOINT);
    const update = () => setIsPopover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    if (!open || !isPopover || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setAlignLeft(rect.right < POPOVER_MIN_WIDTH + 8);
  }, [open, isPopover]);

  useEffect(() => {
    if (!open || !isPopover) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, isPopover, onClose]);

  if (open && !isPopover) {
    return (
      <>
        {trigger}
        <Sheet title={title} titleId={titleId} onClose={onClose}>
          {children}
        </Sheet>
      </>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`absolute z-30 mt-1.5 flex max-h-[80vh] w-max flex-col gap-4 overflow-y-auto rounded-xl border p-3 shadow-lg ${alignLeft ? "left-0" : "right-0"}`}
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface CommonProps {
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Shown when there is no value ("None" by default). */
  placeholder?: string;
  /** Sheet title. */
  title?: string;
}

/** A date (`YYYY-MM-DD`) picked from a calendar in a sheet. Tapping a day
 * sets it and closes. `optional` adds a Clear action. */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  optional = false,
  placeholder = "None",
  title = "Date",
  ariaLabel,
  disabled,
  className,
  renderTrigger,
}: CommonProps & {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  optional?: boolean;
  /** Replace the default capsule — e.g. Log's day stepper title. */
  renderTrigger?: (open: () => void, display: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const display = formatDateValue(value);
  const today = todayISO();
  const todayOk = (min == null || today >= min) && (max == null || today <= max);
  return (
    <PickerShell
      title={title}
      titleId={id}
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        renderTrigger ? (
          renderTrigger(() => setOpen(true), display)
        ) : (
          <Trigger display={display} placeholder={placeholder} empty={!value} onOpen={() => setOpen(true)} ariaLabel={ariaLabel} disabled={disabled} className={className} />
        )
      }
    >
      <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <Calendar
          value={value}
          min={min}
          max={max}
          onPick={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
      </div>
      <PickerActions>
        {optional && value ? (
          <ActionButton
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Clear
          </ActionButton>
        ) : (
          <span />
        )}
        {todayOk && (
          <ActionButton
            onClick={() => {
              onChange(today);
              setOpen(false);
            }}
          >
            Today
          </ActionButton>
        )}
      </PickerActions>
    </PickerShell>
  );
}

/** A time (`HH:mm`) set with hour and minute wheels. Changes apply live;
 * Done closes, Now jumps to the current time. */
export function TimePicker({
  value,
  onChange,
  optional = false,
  title = "Time",
  placeholder = "None",
  ariaLabel,
  disabled,
  className,
  renderTrigger,
}: CommonProps & {
  value: string;
  onChange: (value: string) => void;
  /** Adds a Clear action that sets the value to an empty string. */
  optional?: boolean;
  renderTrigger?: (open: () => void, display: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const display = /^\d{1,2}:\d{2}/.test(value) ? value.slice(0, 5) : "";
  return (
    <PickerShell
      title={title}
      titleId={id}
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        renderTrigger ? (
          renderTrigger(() => setOpen(true), display)
        ) : (
          <Trigger display={display} placeholder={placeholder} empty={!display} onOpen={() => setOpen(true)} ariaLabel={ariaLabel} disabled={disabled} className={className} />
        )
      }
    >
      <div className="rounded-xl border py-2" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <TimeWheels value={display || "12:00"} onChange={onChange} />
      </div>
      <PickerActions>
        {optional && display ? (
          <ActionButton
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Clear
          </ActionButton>
        ) : (
          <ActionButton
            onClick={() => {
              const now = new Date();
              onChange(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
            }}
          >
            Now
          </ActionButton>
        )}
        <ActionButton onClick={() => setOpen(false)} strong>
          Done
        </ActionButton>
      </PickerActions>
    </PickerShell>
  );
}

/** A date and time (`YYYY-MM-DDTHH:mm`) — calendar plus wheels in one sheet,
 * confirmed with Done. `optional` adds a Clear action. */
export function DateTimePicker({
  value,
  onChange,
  min,
  max,
  optional = false,
  placeholder = "None",
  title = "Date & time",
  ariaLabel,
  disabled,
  className,
}: CommonProps & {
  value: string;
  onChange: (value: string) => void;
  /** Bounds apply to the date part (`YYYY-MM-DD`). */
  min?: string;
  max?: string;
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { date, time } = splitDateTime(value);
  const display = date ? `${formatDateValue(date)}, ${time || "00:00"}` : "";
  const now = new Date();
  const nowTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  return (
    <PickerShell
      title={title}
      titleId={id}
      open={open}
      onClose={() => setOpen(false)}
      trigger={<Trigger display={display} placeholder={placeholder} empty={!display} onOpen={() => setOpen(true)} ariaLabel={ariaLabel} disabled={disabled} className={className} />}
    >
      <div className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <Calendar value={date} min={min?.slice(0, 10)} max={max?.slice(0, 10)} onPick={(iso) => onChange(joinDateTime(iso, time || nowTime))} />
        <div className="border-t pt-2" style={{ borderColor: "var(--gridline)" }}>
          <TimeWheels value={time || nowTime} onChange={(t) => onChange(joinDateTime(date || todayISO(), t))} />
        </div>
      </div>
      <PickerActions>
        {optional && value ? (
          <ActionButton
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Clear
          </ActionButton>
        ) : (
          <ActionButton onClick={() => onChange(joinDateTime(todayISO(), nowTime))}>Now</ActionButton>
        )}
        <ActionButton onClick={() => setOpen(false)} strong>
          Done
        </ActionButton>
      </PickerActions>
    </PickerShell>
  );
}

/** A month (`YYYY-MM`) chosen from a year-and-months grid. */
export function MonthPicker({
  value,
  onChange,
  max,
  title = "Month",
  ariaLabel,
  className,
  renderTrigger,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Latest selectable month, `YYYY-MM`. */
  max?: string;
  title?: string;
  ariaLabel?: string;
  className?: string;
  renderTrigger?: (open: () => void, display: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const parsed = parseISODate(`${value}-01`);
  const [year, setYear] = useState(parsed?.y ?? new Date().getFullYear());
  const display = formatMonthValue(value);
  return (
    <PickerShell
      title={title}
      titleId={id}
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        renderTrigger ? (
          renderTrigger(() => setOpen(true), display)
        ) : (
          <Trigger display={display} placeholder="None" empty={!display} onOpen={() => setOpen(true)} ariaLabel={ariaLabel} className={className} />
        )
      }
    >
      <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <MonthGrid
          year={year}
          month={parsed && parsed.y === year ? parsed.m : -1}
          maxYM={max}
          onYear={setYear}
          onPick={(y, m) => {
            onChange(`${y}-${pad2(m + 1)}`);
            setOpen(false);
          }}
        />
      </div>
    </PickerShell>
  );
}
