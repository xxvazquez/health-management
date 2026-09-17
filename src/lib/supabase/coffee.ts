import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, deleteWhereDirect, upsertDirect } from "./directWrite";

// --- Items (catalog) -------------------------------------------------

/** One coffee, reusable across logs. Brand and tasting notes are entered
 * once when the coffee is first logged (see Log → Coffee's "no match, add
 * it" flow) — there's no separate managed brand list, since a brand is an
 * attribute of a specific coffee, not a reusable reference value the way
 * brewing type/method are. */
export interface CoffeeItem {
  id: string;
  name: string;
  brand: string | null;
  notes: string | null;
  isArchived: boolean;
}

interface CoffeeItemRow {
  id: string;
  name: string;
  brand: string | null;
  notes: string | null;
  is_archived: boolean;
}

const ITEM_TABLE = "coffee_items";
const ITEM_COLUMNS = "id, name, brand, notes, is_archived";

function toItem(row: CoffeeItemRow): CoffeeItem {
  return { id: row.id, name: row.name, brand: row.brand, notes: row.notes, isArchived: row.is_archived };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchCoffeeItems(): Promise<CoffeeItem[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from(ITEM_TABLE).select(ITEM_COLUMNS).eq("user_id", myUserId).order("name", { ascending: true });
  if (error) throw error;
  return (data as CoffeeItemRow[]).map(toItem);
}

export interface NewCoffeeItemInput {
  name: string;
  brand: string;
  notes: string;
}

export async function createCoffeeItem(input: NewCoffeeItemInput): Promise<CoffeeItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const item: CoffeeItem = {
    id: createTimeOrderedId(),
    name: input.name.trim(),
    brand: input.brand.trim() || null,
    notes: input.notes.trim() || null,
    isArchived: false,
  };
  await upsertDirect(myUserId, ITEM_TABLE, item.id, {
    id: item.id,
    user_id: myUserId,
    name: item.name,
    brand: item.brand,
    notes: item.notes,
    is_archived: item.isArchived,
    updated_at: new Date().toISOString(),
  });
  return item;
}

export interface CoffeeItemPatch {
  name?: string;
  brand?: string;
  notes?: string;
  isArchived?: boolean;
}

export async function updateCoffeeItem(item: CoffeeItem, patch: CoffeeItemPatch): Promise<CoffeeItem> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: CoffeeItem = {
    ...item,
    name: patch.name !== undefined ? patch.name.trim() : item.name,
    brand: patch.brand !== undefined ? patch.brand.trim() || null : item.brand,
    notes: patch.notes !== undefined ? patch.notes.trim() || null : item.notes,
    isArchived: patch.isArchived !== undefined ? patch.isArchived : item.isArchived,
  };
  await upsertDirect(myUserId, ITEM_TABLE, next.id, {
    id: next.id,
    user_id: myUserId,
    name: next.name,
    brand: next.brand,
    notes: next.notes,
    is_archived: next.isArchived,
    updated_at: new Date().toISOString(),
  });
  return next;
}

export async function deleteCoffeeItem(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteDirect(myUserId, ITEM_TABLE, id);
}

// --- Logs (one per cup) ------------------------------------------------

export interface CoffeeLog {
  id: string;
  itemId: string;
  date: string;
  loggedAt: string;
  cafe: string | null;
  price: number | null;
  brewingType: string | null;
  brewingMethod: string | null;
  waterTempC: number | null;
  characteristics: string[];
  note: string | null;
}

interface CoffeeLogRow {
  id: string;
  item_id: string;
  date: string;
  logged_at: string;
  cafe: string | null;
  price: number | string | null;
  brewing_type: string | null;
  brewing_method: string | null;
  water_temp_c: number | null;
  characteristics: string[];
  note: string | null;
}

const LOG_TABLE = "coffee_logs";
const LOG_COLUMNS = "id, item_id, date, logged_at, cafe, price, brewing_type, brewing_method, water_temp_c, characteristics, note";

function toLog(row: CoffeeLogRow): CoffeeLog {
  return {
    id: row.id,
    itemId: row.item_id,
    date: row.date,
    loggedAt: row.logged_at,
    cafe: row.cafe,
    price: row.price == null ? null : typeof row.price === "string" ? Number(row.price) : row.price,
    brewingType: row.brewing_type,
    brewingMethod: row.brewing_method,
    waterTempC: row.water_temp_c,
    characteristics: row.characteristics,
    note: row.note,
  };
}

export async function fetchCoffeeLogs(): Promise<CoffeeLog[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from(LOG_TABLE).select(LOG_COLUMNS).eq("user_id", myUserId).order("logged_at", { ascending: false });
  if (error) throw error;
  return (data as CoffeeLogRow[]).map(toLog);
}

export interface NewCoffeeLogInput {
  itemId: string;
  date: string;
  /** ISO timestamp — the caller combines the page's selected date with the
   * time picked in the form, same as Stool's own loggedAtTime. */
  loggedAt: string;
  cafe: string;
  price: number | null;
  brewingType: string | null;
  brewingMethod: string | null;
  waterTempC: number | null;
  characteristics: string[];
  note: string;
}

function logPayload(id: string, input: NewCoffeeLogInput, userId: string): Record<string, unknown> {
  return {
    id,
    user_id: userId,
    item_id: input.itemId,
    date: input.date,
    logged_at: input.loggedAt,
    cafe: input.cafe.trim() || null,
    price: input.price,
    brewing_type: input.brewingType,
    brewing_method: input.brewingMethod,
    water_temp_c: input.waterTempC,
    characteristics: input.characteristics,
    note: input.note.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

export async function createCoffeeLog(input: NewCoffeeLogInput): Promise<CoffeeLog> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const id = createTimeOrderedId();
  await upsertDirect(myUserId, LOG_TABLE, id, logPayload(id, input, myUserId));
  return {
    id,
    itemId: input.itemId,
    date: input.date,
    loggedAt: input.loggedAt,
    cafe: input.cafe.trim() || null,
    price: input.price,
    brewingType: input.brewingType,
    brewingMethod: input.brewingMethod,
    waterTempC: input.waterTempC,
    characteristics: input.characteristics,
    note: input.note.trim() || null,
  };
}

export async function updateCoffeeLog(id: string, input: NewCoffeeLogInput): Promise<CoffeeLog> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await upsertDirect(myUserId, LOG_TABLE, id, logPayload(id, input, myUserId));
  return {
    id,
    itemId: input.itemId,
    date: input.date,
    loggedAt: input.loggedAt,
    cafe: input.cafe.trim() || null,
    price: input.price,
    brewingType: input.brewingType,
    brewingMethod: input.brewingMethod,
    waterTempC: input.waterTempC,
    characteristics: input.characteristics,
    note: input.note.trim() || null,
  };
}

export async function deleteCoffeeLog(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteDirect(myUserId, LOG_TABLE, id);
}

// --- Settings (currency) ------------------------------------------------

const SETTINGS_TABLE = "coffee_settings";
const DEFAULT_CURRENCY = "zł";

export async function fetchCoffeeCurrency(): Promise<string> {
  if (!supabase) return DEFAULT_CURRENCY;
  const myUserId = await currentUserId();
  if (!myUserId) return DEFAULT_CURRENCY;
  const { data, error } = await supabase.from(SETTINGS_TABLE).select("currency").eq("user_id", myUserId).maybeSingle();
  if (error) throw error;
  return data?.currency ?? DEFAULT_CURRENCY;
}

export async function setCoffeeCurrency(currency: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await upsertDirect(myUserId, SETTINGS_TABLE, myUserId, {
    user_id: myUserId,
    currency: currency.trim() || DEFAULT_CURRENCY,
    updated_at: new Date().toISOString(),
  });
}

export async function clearCoffeeCurrency(): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  await deleteWhereDirect(myUserId, SETTINGS_TABLE, { user_id: myUserId });
}
