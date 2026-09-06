"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Hydration-safe "are we past the first client render yet". The server /
 * static-export snapshot is `false`, the client's is `true`, so gating
 * wall-clock-dependent content (which differs between build time and load
 * time) on this avoids a hydration mismatch without an effect-driven
 * setState. Same trick `PrimaryAction` uses inline. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
