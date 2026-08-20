import { describe, expect, it } from "vitest";
import { withDataLock } from "./indexedDb";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withDataLock", () => {
  it("runs a single operation and returns its result", async () => {
    const result = await withDataLock(async () => 42);
    expect(result).toBe(42);
  });

  it("propagates a thrown error to the caller", async () => {
    await expect(
      withDataLock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("serializes two operations submitted back-to-back — the second never starts before the first resolves", async () => {
    const order: string[] = [];
    const first = withDataLock(async () => {
      order.push("first:start");
      await sleep(20);
      order.push("first:end");
    });
    const second = withDataLock(async () => {
      order.push("second:start");
      order.push("second:end");
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("does not jam the queue when an earlier operation rejects", async () => {
    const order: string[] = [];
    const failing = withDataLock(async () => {
      order.push("failing");
      throw new Error("expected failure");
    });
    const next = withDataLock(async () => {
      order.push("next");
      return "ok";
    });
    await expect(failing).rejects.toThrow("expected failure");
    await expect(next).resolves.toBe("ok");
    expect(order).toEqual(["failing", "next"]);
  });

  it("a write submitted while a pull is mid-flight waits for the whole pull to finish, not just its first step", async () => {
    // Mirrors the exact bug: pullFromCloud's clearAllData() used to be able
    // to run in between a local write's put and the read that follows it.
    // A write that starts once the pull has already begun must not be able
    // to land in the gap between "clear" and "repopulate finishes".
    const order: string[] = [];
    const pull = withDataLock(async () => {
      order.push("pull:clear");
      await sleep(10);
      order.push("pull:repopulate-start");
      await sleep(10);
      order.push("pull:repopulate-end");
    });
    await sleep(1); // let the pull actually acquire the lock first
    const write = withDataLock(async () => {
      order.push("write");
    });
    await Promise.all([pull, write]);
    expect(order).toEqual(["pull:clear", "pull:repopulate-start", "pull:repopulate-end", "write"]);
  });

  it("a write already in flight finishes before a pull that starts afterward can begin clearing", async () => {
    const order: string[] = [];
    const write = withDataLock(async () => {
      order.push("write:start");
      await sleep(10);
      order.push("write:end");
    });
    await sleep(1); // let the write actually acquire the lock first
    const pull = withDataLock(async () => {
      order.push("pull:clear");
    });
    await Promise.all([write, pull]);
    expect(order).toEqual(["write:start", "write:end", "pull:clear"]);
  });
});
