/** Currencies an organisation can choose. Safe to import in the browser. */
export const CURRENCIES = [
  { code: "GBP", label: "GBP: British pound (£)" },
  { code: "EUR", label: "EUR: Euro (€)" },
  { code: "USD", label: "USD: US dollar ($)" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]];

export const DEFAULT_CURRENCY: CurrencyCode = "GBP";

/**
 * Options for an org's currency picker. An org created before this list existed
 * (e.g. NGN) keeps its current code as an option, so saving other settings never
 * silently switches currency: amounts are stored as-is and are not converted.
 */
export function currencyOptions(current?: string): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = CURRENCIES.map((c) => ({ value: c.code, label: c.label }));
  if (current && !CURRENCY_CODES.includes(current as CurrencyCode)) {
    options.unshift({ value: current, label: `${current} (current)` });
  }
  return options;
}
