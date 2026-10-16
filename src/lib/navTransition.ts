import { flushSync } from "react-dom";

export type NavDirection = "forward" | "back";

/** Phone-sized layouts get the iOS push/pop slide; desktop swaps in place. */
const SLIDE_QUERY = "(max-width: 1023px) and (prefers-reduced-motion: no-preference)";

/**
 * Runs `update` (the state change that opens or closes a detail screen) as
 * an iOS navigation slide: forward pushes the new screen in from the right,
 * back slides it away to reveal the one underneath. Falls back to a plain
 * update where View Transitions aren't supported, on wide screens, with
 * reduced motion, or when the browser already animated a swipe back
 * (`event.hasUAVisualTransition`).
 */
export function navTransition(direction: NavDirection, update: () => void, event?: Event): void {
  const doc = typeof document === "undefined" ? undefined : document;
  const uaAnimated = (event as { hasUAVisualTransition?: boolean } | undefined)?.hasUAVisualTransition === true;
  if (!doc?.startViewTransition || uaAnimated || !window.matchMedia(SLIDE_QUERY).matches) {
    update();
    return;
  }
  const root = doc.documentElement;
  root.dataset.nav = direction;
  const transition = doc.startViewTransition(() => flushSync(update));
  // A skipped transition (page hidden, a newer one started) still runs the
  // update; only the animation is lost.
  transition.ready.catch(() => {});
  transition.finished
    .catch(() => {})
    .finally(() => {
      if (root.dataset.nav === direction) delete root.dataset.nav;
    });
}
