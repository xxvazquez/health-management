import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAllOutboxEntries } from "@/lib/db/indexedDb";

let upsertResult: { error: { code?: string; message: string } | null } = { error: null };
let deleteResult: { error: { code?: string; message: string } | null } = { error: null };
let thrown: Error | null = null;
const sentCalls: { table: string; op: string }[] = [];

vi.mock("./client", () => ({
  get supabase() {
    return {
      from(table: string) {
        return {
          upsert: async () => {
            sentCalls.push({ table, op: "upsert" });
            if (thrown) throw thrown;
            return upsertResult;
          },
          delete: () => ({
            eq: async () => {
              sentCalls.push({ table, op: "delete" });
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
