/**
 * Reusable, server-side normalization helpers.
 *
 * Rule of thumb: the ORIGINAL legal values are preserved for storage/display;
 * separate "normalized" values are derived only for matching/deduplication.
 */

/** Collapse repeated internal whitespace and trim the ends. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Clean a free-text value; returns null when empty. */
export function cleanText(value: string | undefined | null): string | null {
  if (value == null) return null;
  const cleaned = collapseWhitespace(value);
  return cleaned.length > 0 ? cleaned : null;
}

/** Trim an address line and collapse repeated spaces, preserving structure. */
export function normalizeAddressLine(
  value: string | undefined | null,
): string | null {
  return cleanText(value);
}

/**
 * Uppercase, punctuation-reduced form of a business name used ONLY for
 * duplicate comparison. The stored legal name is never altered.
 */
export function normalizeBusinessName(value: string): string {
  return collapseWhitespace(value)
    .toUpperCase()
    .replace(/[.,'"`]/g, "")
    .replace(/&/g, " AND ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Uppercase, trimmed state code. Returns null when empty. */
export function normalizeState(value: string | undefined | null): string | null {
  const cleaned = cleanText(value);
  return cleaned ? cleaned.toUpperCase() : null;
}

/**
 * Normalize a ZIP code as a STRING (never a number), preserving leading zeros
 * and supporting ZIP / ZIP+4. Returns null when empty.
 */
export function normalizeZip(value: string | undefined | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export type DateParseResult =
  | { ok: true; date: Date | null }
  | { ok: false; reason: string };

/**
 * Parse a date from MM/DD/YYYY or ISO (YYYY-MM-DD) form.
 * - Empty input is valid and yields a null date (no error).
 * - Ambiguous or unparseable non-empty input is an error (never guessed).
 */
export function parseEffectiveDate(
  value: string | undefined | null,
): DateParseResult {
  if (value == null) return { ok: true, date: null };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, date: null };

  const mdY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (mdY) {
    const month = Number(mdY[1]);
    const day = Number(mdY[2]);
    const year = Number(mdY[3]);
    return buildDate(year, month, day, trimmed);
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(trimmed);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return buildDate(year, month, day, trimmed);
  }

  return { ok: false, reason: `Unrecognized date format: "${trimmed}"` };
}

function buildDate(
  year: number,
  month: number,
  day: number,
  original: string,
): DateParseResult {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, reason: `Invalid calendar date: "${original}"` };
  }
  // Use UTC noon to avoid timezone rollovers shifting the calendar day.
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, reason: `Invalid calendar date: "${original}"` };
  }
  return { ok: true, date };
}
