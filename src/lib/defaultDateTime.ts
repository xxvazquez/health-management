/** The time a date-and-time picker starts at before one is chosen — set in
 * Settings → Reminder lists. Unset means the next full hour. Kept per
 * device, like the theme. */
const KEY = "lauva.defaultTime";

export function getDefaultTime(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && /^\d{2}:\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function setDefaultTime(time: string | null): void {
  try {
    if (time) window.localStorage.setItem(KEY, time);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked — the next full hour stays the default.
  }
}
