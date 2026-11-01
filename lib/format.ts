import { formatMoney } from "@/lib/roi/money";

export { formatMoney };

export function formatPct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function formatRoi(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  return `${x >= 0 ? "" : "−"}${Math.abs(x * 100).toFixed(0)}%`;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatNumber(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined) return "—";
  return x.toLocaleString("en-GB", { maximumFractionDigits: digits });
}

/** Compact money for chart axes: ₦1.2M */
export function formatMoneyCompact(value: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
