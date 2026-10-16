/**
 * A light tap of feedback for a touch that registered. Android uses the
 * Vibration API; iOS Safari has none, but toggling an `<input switch>`
 * plays the system switch haptic (iOS 18+), so a hidden one is clicked
 * instead. Must run inside the tap's own handler — iOS ignores it after an
 * `await`. Does nothing with a mouse or where neither is supported.
 */
export function haptic(): void {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(8);
    return;
  }
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}
