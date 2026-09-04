import { supabase } from "./client";
import type { CustomAppearance } from "@/components/ui/customIcons";

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
const MARKER_COLUMNS = `id, panel_id, name, unit, ref_low, ref_high, sort_order, lab_results(${RESULT_COLUMNS})`;
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

function notConfigured(): Error {
  return new Error("Cloud sync isn't set up for this deployment.");
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
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("lab_panels")
    .insert({ user_id: myUserId, name: name.trim(), sort_order: sortOrder, icon: appearance?.icon ?? null, color: appearance?.color ?? null })
    .select(PANEL_COLUMNS)
    .single();
  if (error) throw error;
  return toPanel(data as PanelRow);
}

export interface LabPanelPatch {
  name?: string;
  sortOrder?: number;
  icon?: string | null;
  color?: string | null;
}

export async function updateLabPanel(id: string, patch: LabPanelPatch): Promise<void> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.color !== undefined) update.color = patch.color;
  const { error } = await supabase.from("lab_panels").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteLabPanel(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("lab_panels").delete().eq("id", id);
  if (error) throw error;
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
  sortOrder: number;
}

export async function createLabMarker(input: NewLabMarkerInput): Promise<LabMarker> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("lab_markers")
    .insert({
      user_id: myUserId,
      panel_id: input.panelId,
      name: input.name.trim(),
      unit: input.unit.trim() || null,
      ref_low: input.refLow,
      ref_high: input.refHigh,
      sort_order: input.sortOrder,
    })
    .select(MARKER_COLUMNS)
    .single();
  if (error) throw error;
  return toMarker(data as MarkerRow);
}

export interface LabMarkerPatch {
  panelId?: string | null;
  name?: string;
  unit?: string;
  refLow?: number | null;
  refHigh?: number | null;
  sortOrder?: number;
}

export async function updateLabMarker(id: string, patch: LabMarkerPatch): Promise<LabMarker> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.panelId !== undefined) update.panel_id = patch.panelId;
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.unit !== undefined) update.unit = patch.unit.trim() || null;
  if (patch.refLow !== undefined) update.ref_low = patch.refLow;
  if (patch.refHigh !== undefined) update.ref_high = patch.refHigh;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { data, error } = await supabase.from("lab_markers").update(update).eq("id", id).select(MARKER_COLUMNS).single();
  if (error) throw error;
  return toMarker(data as MarkerRow);
}

export async function deleteLabMarker(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("lab_markers").delete().eq("id", id);
  if (error) throw error;
}

// --- Results ----------------------------------------------------------

export interface NewLabResultInput {
  markerId: string;
  measuredOn: string;
  value: number;
  lab: string;
  note: string;
}

export async function createLabResult(input: NewLabResultInput): Promise<LabResult> {
  if (!supabase) throw notConfigured();
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("lab_results")
    .insert({
      user_id: myUserId,
      marker_id: input.markerId,
      measured_on: input.measuredOn,
      value: input.value,
      lab: input.lab.trim() || null,
      note: input.note.trim() || null,
    })
    .select(RESULT_COLUMNS)
    .single();
  if (error) throw error;
  return toResult(data as ResultRow);
}

/** Insert a whole blood draw at once — one round trip, `user_id` set
 * explicitly per row. Returns the created results in input order. */
export async function createLabResults(inputs: NewLabResultInput[]): Promise<LabResult[]> {
  if (!supabase) throw notConfigured();
  if (inputs.length === 0) return [];
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("lab_results")
    .insert(
      inputs.map((input) => ({
        user_id: myUserId,
        marker_id: input.markerId,
        measured_on: input.measuredOn,
        value: input.value,
        lab: input.lab.trim() || null,
        note: input.note.trim() || null,
      })),
    )
    .select(RESULT_COLUMNS);
  if (error) throw error;
  return (data as ResultRow[]).map(toResult);
}

export interface LabResultPatch {
  measuredOn?: string;
  value?: number;
  lab?: string;
  note?: string;
}

export async function updateLabResult(id: string, patch: LabResultPatch): Promise<LabResult> {
  if (!supabase) throw notConfigured();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.measuredOn !== undefined) update.measured_on = patch.measuredOn;
  if (patch.value !== undefined) update.value = patch.value;
  if (patch.lab !== undefined) update.lab = patch.lab.trim() || null;
  if (patch.note !== undefined) update.note = patch.note.trim() || null;
  const { data, error } = await supabase.from("lab_results").update(update).eq("id", id).select(RESULT_COLUMNS).single();
  if (error) throw error;
  return toResult(data as ResultRow);
}

export async function deleteLabResult(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("lab_results").delete().eq("id", id);
  if (error) throw error;
}
