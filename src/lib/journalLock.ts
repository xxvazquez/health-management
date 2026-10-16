"use client";

import { useCallback, useEffect, useState } from "react";
import { usePreferences } from "@/lib/usePreferences";
import { useAuth } from "@/lib/supabase/AuthContext";

/**
 * Journal lock: Face ID / Touch ID / the device passcode before Journal
 * shows, through a WebAuthn platform credential. It's a privacy screen for
 * someone holding your unlocked phone, like a locked note — the entries
 * themselves aren't encrypted. Whether it's on syncs (`prefs.journalLock`);
 * the credential is per device, made the first time that device unlocks,
 * and its id is kept in localStorage.
 */

/** Away from the app longer than this and Journal locks again. */
export const RELOCK_AFTER_MS = 60_000;

const STORAGE_PREFIX = "lauva:journal-lock:";
/** Authenticator data flag: the user was verified (biometrics or passcode), not just present. */
const UV_FLAG = 0x04;

type Listener = () => void;
const state = { unlocked: false, hiddenAt: 0 };
const listeners = new Set<Listener>();
const publish = () => listeners.forEach((l) => l());

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") state.hiddenAt = Date.now();
    else if (state.unlocked && state.hiddenAt && Date.now() - state.hiddenAt > RELOCK_AFTER_MS) {
      state.unlocked = false;
      publish();
    }
  });
}

/** True when this device can verify its owner (Face ID, Touch ID, Windows Hello, fingerprint). */
export async function platformLockAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(out);
  return out;
}

/** Whether authenticator data says the user was verified. */
export function userVerified(authData: ArrayBuffer | undefined): boolean {
  return !!authData && authData.byteLength > 32 && (new Uint8Array(authData)[32] & UV_FLAG) !== 0;
}

function storedCredential(owner: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + owner);
  } catch {
    return null;
  }
}

function storeCredential(owner: string, id: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + owner, id);
  } catch {
    // Storage blocked — the next unlock makes a new credential instead.
  }
}

/** Makes this device's credential, which itself asks for Face ID. */
async function register(owner: string): Promise<boolean> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: "Lauva" },
      user: { id: randomBytes(16), name: "Journal lock", displayName: "Journal lock" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      attestation: "none",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) return false;
  const response = cred.response as AuthenticatorAttestationResponse;
  const authData = response.getAuthenticatorData?.();
  if (authData && !userVerified(authData)) return false;
  storeCredential(owner, toBase64Url(cred.rawId));
  return true;
}

async function assert(id: string): Promise<boolean> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: "public-key", id: fromBase64Url(id), transports: ["internal"] }],
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  return !!cred && userVerified((cred.response as AuthenticatorAssertionResponse).authenticatorData);
}

/**
 * Asks for Face ID / Touch ID / the passcode. Uses this device's credential,
 * or makes one when there's none yet or `fresh` is set (the old one was
 * removed). Resolves false when cancelled or not verified.
 */
export async function verifyOwner(owner: string, fresh = false): Promise<boolean> {
  try {
    const id = fresh ? null : storedCredential(owner);
    return id ? await assert(id) : await register(owner);
  } catch {
    return false;
  }
}

/** Journal's lock state: whether it's on, whether this device can use it,
 * and whether it's locked right now. */
export function useJournalLock() {
  const { prefs, update } = usePreferences();
  const { session } = useAuth();
  const owner = session?.user?.id ?? "demo";
  const [, rerender] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    void platformLockAvailable().then(setAvailable);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const enabled = prefs.journalLock === true && available === true;

  const unlock = useCallback(
    async (fresh = false) => {
      const ok = await verifyOwner(owner, fresh);
      if (ok) {
        state.unlocked = true;
        publish();
      }
      return ok;
    },
    [owner],
  );

  /** Turning it on or off both need the owner's face or passcode. */
  const setEnabled = useCallback(
    async (on: boolean) => {
      const ok = await verifyOwner(owner);
      if (!ok) return false;
      state.unlocked = true;
      update({ journalLock: on });
      publish();
      return true;
    },
    [owner, update],
  );

  return {
    /** Null until checked. */
    available,
    enabled,
    /** Still checking whether this device can lock — show nothing yet. */
    checking: prefs.journalLock === true && available === null,
    locked: enabled && !state.unlocked,
    unlock,
    setEnabled,
  };
}
