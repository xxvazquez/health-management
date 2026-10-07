// Reads an amount the way an iOS Shortcut sends it: a Wallet transaction's
// Amount comes through as formatted text ("45,00 zł", "€12.50",
// "PLN 1 234,56", "-$3.20"), or a plain number. Shared by the
// expense-import Edge Function and the app; no runtime-specific APIs.

const SYMBOLS: [string, string][] = [
  ["zł", "PLN"],
  ["€", "EUR"],
  ["£", "GBP"],
  ["US$", "USD"],
  ["$", "USD"],
  ["kč", "CZK"],
  ["ft", "HUF"],
  ["¥", "JPY"],
  ["₴", "UAH"],
  ["₺", "TRY"],
];

/** The ISO currency code written in or implied by `text`, or null. */
export function parseCurrency(text: string): string | null {
  const code = text.match(/(?:^|[^A-Za-z])([A-Z]{3})(?![A-Za-z])/);
  if (code) return code[1];
  const lower = text.toLowerCase();
  for (const [symbol, iso] of SYMBOLS) if (lower.includes(symbol)) return iso;
  return null;
}

/** The number in a formatted amount, or null. The last `.` or `,` is the
 * decimal point when one or two digits follow it; every other separator
 * (and spaces, apostrophes) groups thousands. */
export function parseAmountNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const match = raw.match(/[-−]?\s*\d[\d\s  .,']*/);
  if (!match) return null;
  const negative = /[-−]/.test(raw.slice(0, (match.index ?? 0) + 1)) || /^[-−]/.test(match[0]);
  const body = match[0].replace(/[-−\s  ']/g, "").replace(/[.,]+$/, "");
  const last = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
  let value: number;
  if (last !== -1 && body.length - last - 1 <= 2) {
    value = Number(`${body.slice(0, last).replace(/[.,]/g, "")}.${body.slice(last + 1)}`);
  } else {
    value = Number(body.replace(/[.,]/g, ""));
  }
  if (!Number.isFinite(value)) return null;
  return Math.round((negative ? -value : value) * 100) / 100;
}

/** How merchants are matched when a new payment looks for the category it
 * got last time: case, spacing and surrounding punctuation don't matter. */
export function merchantKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
