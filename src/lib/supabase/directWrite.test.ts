import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAllOutboxEntries } from "@/lib/db/indexedDb";

let upsertResult: { error: { code?: string; message: string } | null } = { error: null };
let deleteResult: { error: { code?: string; message: string } | null } = { error: null };
let updateResult: { error: { code?: string; message: string } | null } = { error: null };
let thrown: Error | null = null;
const sentCalls: { table: string; op: string; payload?: unknown }[] = [];

vi.mock("./client", () => ({
  get supabase() {
    return {
      from(table: string) {
        return {
          upsert: async (_payload: unknown, options?: { ignoreDuplicates?: boolean }) => {
            sentCalls.push({ table, op: options?.ignoreDuplicates ? "insert" : "upsert" });
            if (thrown) throw thrown;
            return upsertResult;
          },
          update: (payload: unknown) => ({
            eq: async () => {
              sentCalls.push({ table, op: "update", payload });
              if (thrown) throw thrown;
              return updateResult;
            },
          }),
          delete: () => ({
            eq: async () => {
              sentCalls.push({ table, op: "delete" });
              if (thrown) throw thrown;
              return deleteResult;
            },
            match: async (m: unknown) => {
              sentCalls.push({ table, op: "delete", payload: m });
              if (thrown) throw thrown;
              return deleteResult;
            },
          }),
        };
      },
    };
  },
}));

let counter = 0;
function uniqueId(): string {
  counter += 1;
  return `row-${counter}`;
}

async function entriesFor(dedupeKey: string) {
  return (await getAllOutboxEntries()).filter((e) => e.dedupeKey === dedupeKey);
}

beforeEach(() => {
  upsertResult = { error: null };
  deleteResult = { error: null };
  updateResult = { error: null };
  thrown = null;
  sentCalls.length = 0;
});

afterEach(() => {
  vi.resetModules();
});

describe("upsertDirect", () => {
  it("resolves without queuing anything on success", async () => {
    const id = uniqueId();
    const { upsertDirect } = await import("./directWrite");
    await upsertDirect("user-1", "journal_entries", id, { id, body: "hi" });
    expect(sentCalls).toEqual([{ table: "journal_entries", op: "upsert" }]);
    expect(await entriesFor(`journal_entries:${id}`)).toHaveLength(0);
  });

  it("queues the write when the request never reaches the server", async () => {
    thrown = new TypeError("Failed to fetch");
    const id = uniqueId();
    const { upsertDirect } = await import("./directWrite");
    await expect(upsertDirect("user-2", "journal_entries", id, { id, body: "hi" })).resolves.toBeUndefined();
    const entries = await entriesFor(`journal_entries:${id}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ userId: "user-2", table: "journal_entries", op: "upsert" });
  });

  it("queues a retryable server-side error instead of throwing", async () => {
    upsertResult = { error: { code: "50000", message: "internal error" } };
    const id = uniqueId();
    const { upsertDirect } = await import("./directWrite");
    await upsertDirect("user-3", "journal_entries", id, { id });
    expect(await entriesFor(`journal_entries:${id}`)).toHaveLength(1);
  });

  it("throws (and queues nothing) for a permanent server-side error", async () => {
    upsertResult = { error: { code: "23514", message: "check violation" } };
    const id = uniqueId();
    const { upsertDirect } = await import("./directWrite");
    await expect(upsertDirect("user-4", "journal_entries", id, { id })).rejects.toThrow("check violation");
    expect(await entriesFor(`journal_entries:${id}`)).toHaveLength(0);
  });
});

describe("deleteDirect", () => {
  it("resolves without queuing anything on success", async () => {
    const id = uniqueId();
    const { deleteDirect } = await import("./directWrite");
    await deleteDirect("user-5", "journal_entries", id);
    expect(sentCalls).toEqual([{ table: "journal_entries", op: "delete" }]);
    expect(await entriesFor(`journal_entries:${id}`)).toHaveLength(0);
  });

  it("queues a delete when offline", async () => {
    thrown = new TypeError("Failed to fetch");
    const id = uniqueId();
    const { deleteDirect } = await import("./directWrite");
    await deleteDirect("user-6", "journal_entries", id);
    const entries = await entriesFor(`journal_entries:${id}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ op: "delete", payload: { id } });
  });
});

describe("updateDirect", () => {
  it("sends a plain update (not an upsert) and queues nothing on success", async () => {
    const id = uniqueId();
    const { updateDirect } = await import("./directWrite");
    await updateDirect("user-7", "household_notes", id, { id, owner_id: "partner", title: "T", body: "B" });
    expect(sentCalls).toEqual([{ table: "household_notes", op: "update", payload: { owner_id: "partner", title: "T", body: "B" } }]);
    expect(await entriesFor(`household_notes:${id}`)).toHaveLength(0);
  });

  it("queues the full row as an update when offline", async () => {
    thrown = new TypeError("Failed to fetch");
    const id = uniqueId();
    const { updateDirect } = await import("./directWrite");
    await updateDirect("user-8", "wishlist_items", id, { id, owner_id: "partner", title: "shelf" });
    const entries = await entriesFor(`wishlist_items:${id}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ op: "update", payload: { id, owner_id: "partner", title: "shelf" } });
  });
});

describe("deleteWhereDirect", () => {
  it("deletes by a column match and derives a stable dedupe key", async () => {
    const { deleteWhereDirect } = await import("./directWrite");
    await deleteWhereDirect("user-9", "care_entry_specialties", { entry_id: "e1", specialty_id: "s1" });
    expect(sentCalls).toEqual([{ table: "care_entry_specialties", op: "delete", payload: { entry_id: "e1", specialty_id: "s1" } }]);
    expect(await entriesFor("care_entry_specialties:entry_id=e1&specialty_id=s1")).toHaveLength(0);
  });

  it("cancels a still-unsent matching insertDirect instead of queuing the delete", async () => {
    thrown = new TypeError("Failed to fetch");
    const { insertDirect, deleteWhereDirect } = await import("./directWrite");
    await insertDirect("user-10", "care_entry_specialties", { specialty_id: "s2", entry_id: "e2" }, { user_id: "user-10", entry_id: "e2", specialty_id: "s2" });
    await deleteWhereDirect("user-10", "care_entry_specialties", { entry_id: "e2", specialty_id: "s2" });
    expect(await entriesFor("care_entry_specialties:entry_id=e2&specialty_id=s2")).toHaveLength(0);
  });
});

describe("insertDirect", () => {
  it("sends an ignore-duplicates upsert (ON CONFLICT DO NOTHING)", async () => {
    const { insertDirect } = await import("./directWrite");
    await insertDirect("user-11", "personal_task_completions", { task_id: "t1", completed_at: "2026-09-06T10:00:00Z" }, { id: "c1", task_id: "t1", user_id: "user-11", completed_at: "2026-09-06T10:00:00Z" });
    expect(sentCalls).toEqual([{ table: "personal_task_completions", op: "insert" }]);
    expect(await entriesFor("personal_task_completions:completed_at=2026-09-06T10:00:00Z&task_id=t1")).toHaveLength(0);
  });

  it("queues the row as an insert op when offline", async () => {
    thrown = new TypeError("Failed to fetch");
    const { insertDirect } = await import("./directWrite");
    await insertDirect("user-12", "care_entry_specialties", { entry_id: "e3", specialty_id: "s3" }, { user_id: "user-12", entry_id: "e3", specialty_id: "s3" });
    const entries = await entriesFor("care_entry_specialties:entry_id=e3&specialty_id=s3");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ op: "insert", payload: { entry_id: "e3", specialty_id: "s3" } });
  });
});
