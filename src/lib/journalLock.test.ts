// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userVerified, verifyOwner } from "./journalLock";

/** Authenticator data with the given flags byte (32 bytes of rpIdHash first). */
function authData(flags: number): ArrayBuffer {
  const bytes = new Uint8Array(37);
  bytes[32] = flags;
  return bytes.buffer;
}

const create = vi.fn();
const get = vi.fn();

beforeEach(() => {
  localStorage.clear();
  create.mockReset();
  get.mockReset();
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { create, get } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function madeCredential(flags = 0x05) {
  return { rawId: new Uint8Array([1, 2, 3]).buffer, response: { getAuthenticatorData: () => authData(flags) } };
}

describe("userVerified", () => {
  it("reads the user-verified flag, not just presence", () => {
    expect(userVerified(authData(0x05))).toBe(true);
    expect(userVerified(authData(0x01))).toBe(false);
    expect(userVerified(undefined)).toBe(false);
  });
});

describe("verifyOwner", () => {
  it("makes this device's credential the first time, then reuses it", async () => {
    create.mockResolvedValue(madeCredential());
    await expect(verifyOwner("u1")).resolves.toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].publicKey.authenticatorSelection).toMatchObject({ authenticatorAttachment: "platform", userVerification: "required" });

    get.mockResolvedValue({ response: { authenticatorData: authData(0x05) } });
    await expect(verifyOwner("u1")).resolves.toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
    expect(Array.from(get.mock.calls[0][0].publicKey.allowCredentials[0].id)).toEqual([1, 2, 3]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("keeps a credential per account", async () => {
    create.mockResolvedValue(madeCredential());
    await verifyOwner("u1");
    await verifyOwner("u2");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("refuses an unverified assertion", async () => {
    create.mockResolvedValue(madeCredential());
    await verifyOwner("u1");
    get.mockResolvedValue({ response: { authenticatorData: authData(0x01) } });
    await expect(verifyOwner("u1")).resolves.toBe(false);
  });

  it("treats a cancelled prompt as not verified", async () => {
    create.mockRejectedValue(Object.assign(new Error("cancelled"), { name: "NotAllowedError" }));
    await expect(verifyOwner("u1")).resolves.toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("makes a new credential when asked to set up again", async () => {
    create.mockResolvedValue(madeCredential());
    await verifyOwner("u1");
    await verifyOwner("u1", true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(get).not.toHaveBeenCalled();
  });
});
