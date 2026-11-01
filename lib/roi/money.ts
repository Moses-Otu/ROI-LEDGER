/** Minor-unit digits for a currency (NGN/USD → 2, JPY → 0). */
export function currencyDecimals(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Round half away from zero at `decimals` places, without binary float drift
 * (1.005 → 1.01, -1.005 → -1.01).
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const shifted = Number(`${Math.abs(value)}e${decimals}`);
  const rounded = Number(`${Math.round(shifted)}e-${decimals}`);
  return sign * rounded || 0;
}

export function roundMoney(value: number, currency: string): number {
  return roundTo(value, currencyDecimals(currency));
}

export function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: currencyDecimals(currency),
  }).format(value);
}
