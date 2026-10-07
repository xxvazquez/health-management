export { merchantKey, parseAmountNumber, parseCurrency } from "../../supabase/functions/_shared/money";

/** An amount in its currency, as the device formats money ("45,00 zł",
 * "€12.50"). Falls back to "12.50 XYZ" for a code Intl doesn't know. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
