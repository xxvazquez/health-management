import { supabase } from "./client";
import type { CustomAppearance } from "@/components/ui/customIcons";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, upsertDirect } from "./directWrite";

export interface LabResult {
  id: string;
  markerId: string;
  /** Local date the sample was taken, YYYY-MM-DD. */
  measuredOn: string;
  value: number;
  lab: string | null;
  note: string | null;
}

export interface LabMarker {
  id: string;
  /** Panel this marker belongs to, or null for ungrouped. */
  panelId: string | null;
  name: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  /** The personal target band, tighter than the lab reference range —
   * drives the "below / above optimal" read on the Results overview. */
  optimalLow: number | null;
  optimalHigh: number | null;
  sortOrder: number;
  /** Oldest first — the order a trend line reads in. */
  results: LabResult[];
}

export interface LabPanel {
  id: string;
  name: string;
  sortOrder: number;
  /** Custom appearance from ui/customIcons — both null falls back to the
   * page's existing hardcoded look. */
  icon: string | null;
  color: string | null;
}

interface ResultRow {
  id: string;
  marker_id: string;
  measured_on: string;
  value: number | string;
  lab: string | null;
  note: string | null;
}

interface MarkerRow {
  id: string;
  panel_id: string | null;
  name: string;
  unit: string | null;
  ref_low: number | string | null;
  ref_high: number | string | null;
  optimal_low: number | string | null;
  optimal_high: number | string | null;
  sort_order: number;
  lab_results: ResultRow[] | null;
}

interface PanelRow {
  id: string;
  name: string;
  sort_order: number;
  icon: string | null;
  color: string | null;
}

const RESULT_COLUMNS = "id, marker_id, measured_on, value, lab, note";
const MARKER_COLUMNS = `id, panel_id, name, unit, ref_low, ref_high, optimal_low, optimal_high, sort_order, lab_results(${RESULT_COLUMNS})`;
const PANEL_COLUMNS = "id, name, sort_order, icon, color";

/** Postgres `numeric` comes back as a string over the wire. */
function num(v: number | string | null): number | null {
  if (v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function toResult(row: ResultRow): LabResult {
  return { id: row.id, markerId: row.marker_id, measuredOn: row.measured_on, value: num(row.value) ?? 0, lab: row.lab, note: row.note };
}

function toMarker(row: MarkerRow): LabMarker {
  return {
    id: row.id,
    panelId: row.panel_id,
    name: row.name,
    unit: row.unit,
    refLow: num(row.ref_low),
    refHigh: num(row.ref_high),
    optimalLow: num(row.optimal_low),
    optimalHigh: num(row.optimal_high),
    sortOrder: row.sort_order,
    results: (row.lab_results ?? []).map(toResult).sort((a, b) => a.measuredOn.localeCompare(b.measuredOn)),
  };
}

function toPanel(row: PanelRow): LabPanel {
  return { id: row.id, name: row.name, sortOrder: row.sort_order, icon: row.icon, color: row.color };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

// The lab_* tables are all owner-only (`for all` RLS), so a whole-row
// upsert is safe — a create, or an edit, goes through directWrite.
const PANELS_TABLE = "lab_panels";
const MARKERS_TABLE = "lab_markers";
const RESULTS_TABLE = "lab_results";

function panelPayload(p: LabPanel, userId: string): Record<string, unknown> {
  return { id: p.id, user_id: userId, name: p.name.trim(), sort_order: p.sortOrder, icon: p.icon, color: p.color, updated_at: new Date().toISOString() };
}

function markerPayload(m: LabMarker, userId: string): Record<string, unknown> {
  return {
    id: m.id,
    user_id: userId,
    panel_id: m.panelId,
    name: m.name.trim(),
    unit: m.unit,
    ref_low: m.refLow,
    ref_high: m.refHigh,
    optimal_low: m.optimalLow,
    optimal_high: m.optimalHigh,
    sort_order: m.sortOrder,
    updated_at: new Date().toISOString(),
  };
}

function resultPayload(r: LabResult, userId: string): Record<string, unknown> {
  return { id: r.id, user_id: userId, marker_id: r.markerId, measured_on: r.measuredOn, value: r.value, lab: r.lab, note: r.note, updated_at: new Date().toISOString() };
}

// --- Panels -------------------------------------------------------------

export async function fetchLabPanels(): Promise<LabPanel[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("lab_panels")
    .select(PANEL_COLUMNS)
    .eq("user_id", myUserId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as PanelRow[]).map(toPanel);
}

export async function createLabPanel(name: string, sortOrder: number, appearance?: CustomAppearance): Promise<LabPanel> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const p: LabPanel = { id: createTimeOrderedId(), name: name.trim(), sortOrder, icon: appearance?.icon ?? null, color: appearance?.color ?? null };
  await upsertDirect(myUserId, PANELS_TABLE, p.id, panelPayload(p, myUserId));
  return p;
}

export interface LabPanelPatch {
  name?: string;
  sortOrder?: number;
  icon?: string | null;
  color?: string | null;
}

/** Takes the full current panel so an offline edit upserts a complete row. */
export async function updateLabPanel(panel: LabPanel, patch: LabPanelPatch): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: LabPanel = {
    ...panel,
    name: patch.name !== undefined ? patch.name.trim() : panel.name,
    sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : panel.sortOrder,
    icon: patch.icon !== undefined ? patch.icon : panel.icon,
    color: patch.color !== undefined ? patch.color : panel.color,
  };
  await upsertDirect(myUserId, PANELS_TABLE, next.id, panelPayload(next, myUserId));
}

export async function deleteLabPanel(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, PANELS_TABLE, id);
}

// --- Markers -----------------------------------------------------------

export async function fetchLabMarkers(): Promise<LabMarker[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("lab_markers")
    .select(MARKER_COLUMNS)
    .eq("user_id", myUserId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as MarkerRow[]).map(toMarker);
}

export interface NewLabMarkerInput {
  panelId: string | null;
  name: string;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
  sortOrder: number;
}

export async function createLabMarker(input: NewLabMarkerInput): Promise<LabMarker> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const m: LabMarker = {
    id: createTimeOrderedId(),
    panelId: input.panelId,
    name: input.name.trim(),
    unit: input.unit.trim() || null,
    refLow: input.refLow,
    refHigh: input.refHigh,
    optimalLow: input.optimalLow,
    optimalHigh: input.optimalHigh,
    sortOrder: input.sortOrder,
    results: [],
  };
  await upsertDirect(myUserId, MARKERS_TABLE, m.id, markerPayload(m, myUserId));
  return m;
}

export interface LabMarkerPatch {
  panelId?: string | null;
  name?: string;
  unit?: string;
  refLow?: number | null;
  refHigh?: number | null;
  optimalLow?: number | null;
  optimalHigh?: number | null;
  sortOrder?: number;
}

/** Takes the full current marker (its `results` are left untouched — those
 * are their own rows). */
export async function updateLabMarker(marker: LabMarker, patch: LabMarkerPatch): Promise<LabMarker> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: LabMarker = {
    ...marker,
    panelId: patch.panelId !== undefined ? patch.panelId : marker.panelId,
    name: patch.name !== undefined ? patch.name.trim() : marker.name,
    unit: patch.unit !== undefined ? patch.unit.trim() || null : marker.unit,
    refLow: patch.refLow !== undefined ? patch.refLow : marker.refLow,
    refHigh: patch.refHigh !== undefined ? patch.refHigh : marker.refHigh,
    optimalLow: patch.optimalLow !== undefined ? patch.optimalLow : marker.optimalLow,
    optimalHigh: patch.optimalHigh !== undefined ? patch.optimalHigh : marker.optimalHigh,
    sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : marker.sortOrder,
  };
  await upsertDirect(myUserId, MARKERS_TABLE, next.id, markerPayload(next, myUserId));
  return next;
}

export async function deleteLabMarker(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, MARKERS_TABLE, id);
}

// --- Results ----------------------------------------------------------

export interface NewLabResultInput {
  markerId: string;
  measuredOn: string;
  value: number;
  lab: string;
  note: string;
}

function resultFromInput(input: NewLabResultInput): LabResult {
  return {
    id: createTimeOrderedId(),
    markerId: input.markerId,
    measuredOn: input.measuredOn,
    value: input.value,
    lab: input.lab.trim() || null,
    note: input.note.trim() || null,
  };
}

export async function createLabResult(input: NewLabResultInput): Promise<LabResult> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const r = resultFromInput(input);
  await upsertDirect(myUserId, RESULTS_TABLE, r.id, resultPayload(r, myUserId));
  return r;
}

/** A whole blood draw — one row per marker. Each is its own outbox entry
 * (the outbox has no batch op), so an offline draw queues as N inserts
 * that drain in order. Returns the created results in input order. */
export async function createLabResults(inputs: NewLabResultInput[]): Promise<LabResult[]> {
  if (inputs.length === 0) return [];
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const results = inputs.map(resultFromInput);
  for (const r of results) await upsertDirect(myUserId, RESULTS_TABLE, r.id, resultPayload(r, myUserId));
  return results;
}

export interface LabResultPatch {
  measuredOn?: string;
  value?: number;
  lab?: string;
  note?: string;
}

export async function updateLabResult(result: LabResult, patch: LabResultPatch): Promise<LabResult> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: LabResult = {
    ...result,
    measuredOn: patch.measuredOn ?? result.measuredOn,
    value: patch.value ?? result.value,
    lab: patch.lab !== undefined ? patch.lab.trim() || null : result.lab,
    note: patch.note !== undefined ? patch.note.trim() || null : result.note,
  };
  await upsertDirect(myUserId, RESULTS_TABLE, next.id, resultPayload(next, myUserId));
  return next;
}

export async function deleteLabResult(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, RESULTS_TABLE, id);
}
