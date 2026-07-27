export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** True when `date` is within `days` of `now` (i.e. still fresh). */
export function isFresh(
  date: Date | null | undefined,
  days: number,
  now: Date = new Date(),
): boolean {
  if (!date) return false;
  return now.getTime() - date.getTime() < days * 24 * 60 * 60 * 1000;
}

/** True when a cached result has passed its freshness window (is stale). */
export function isStale(
  date: Date | null | undefined,
  days: number,
  now: Date = new Date(),
): boolean {
  if (!date) return false;
  return !isFresh(date, days, now);
}

export function computeExpiry(from: Date, days: number): Date {
  return addDays(from, days);
}
