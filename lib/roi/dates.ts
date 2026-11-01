const MS_PER_DAY = 86_400_000;

/** Average days per month, used to convert monthly volumes to daily rates. */
export const DAYS_PER_MONTH = 365.25 / 12;

/** Whole days since the Unix epoch (UTC) for 'YYYY-MM-DD' or an ISO timestamp. */
export function toDay(value: string): number {
  const ms = value.length === 10 ? Date.parse(`${value}T00:00:00Z`) : Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${value}`);
  return Math.floor(ms / MS_PER_DAY);
}

export function fromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Inclusive day count of [start, end]; 0 when end < start. */
export function daysInclusive(start: number, end: number): number {
  return end < start ? 0 : end - start + 1;
}
