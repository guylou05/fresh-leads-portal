import { z } from "zod";
import { NOTE_MAX_LENGTH, SUMMARY_MAX_LENGTH } from "@/lib/leads/constants";

/** Trim and coerce an empty string to null. */
function blankToNull(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  return value;
}

/** Optional email; blank allowed; normalized to lowercase. Never "verified". */
export const emailField = z.preprocess(
  blankToNull,
  z
    .string()
    .email("Enter a valid email address")
    .max(320)
    .transform((v) => v.toLowerCase())
    .nullable(),
);

/** Optional phone; preserves the user's formatting. */
export const phoneField = z.preprocess(
  blankToNull,
  z.string().max(40, "Phone number is too long").nullable(),
);

/**
 * Normalize a phone to digits (plus a leading +) for searching. Does not assume
 * a country. Returns null when there are no digits.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const hasPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Optional website. Adds https:// only when the user typed a bare domain.
 * Validates URL shape; never fetches or claims the site is active.
 */
export const websiteField = z.preprocess(
  blankToNull,
  z
    .string()
    .max(2048)
    .transform((v, ctx) => {
      let candidate = v.trim();
      if (!/^https?:\/\//i.test(candidate)) {
        // Only auto-prefix a plausible bare domain (contains a dot, no spaces).
        if (/^[^\s/]+\.[^\s/]+/.test(candidate)) {
          candidate = `https://${candidate}`;
        }
      }
      try {
        const url = new URL(candidate);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("bad protocol");
        }
        return url.toString();
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid website URL",
        });
        return z.NEVER;
      }
    })
    .nullable(),
);

/**
 * Parse a user-entered estimated value (USD) into integer cents.
 * Blank is allowed (null). Rejects negatives. No floating-point storage.
 */
export function parseEstimatedValueToCents(
  input: string | null | undefined,
): { ok: true; cents: number | null } | { ok: false; error: string } {
  if (input == null) return { ok: true, cents: null };
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return { ok: true, cents: null };
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: "Enter a valid dollar amount (e.g. 2500 or 2500.00)" };
  }
  const parts = cleaned.split(".");
  const dollars = parts[0] ?? "0";
  const fraction = parts[1] ?? "";
  const cents =
    Number.parseInt(dollars, 10) * 100 +
    Number.parseInt(fraction.padEnd(2, "0"), 10);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    return { ok: false, error: "Amount is out of range" };
  }
  return { ok: true, cents };
}

/** Format integer cents as USD for display. */
export function formatCentsUsd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().max(max).nullable());

/** Schema for the editable sales-workflow fields on a lead. */
export const workflowFieldsSchema = z.object({
  primaryContactName: optionalText(200).optional(),
  primaryContactTitle: optionalText(200).optional(),
  primaryEmail: emailField.optional(),
  primaryPhone: phoneField.optional(),
  website: websiteField.optional(),
  customIndustry: optionalText(120).optional(),
  internalSummary: optionalText(SUMMARY_MAX_LENGTH).optional(),
  estimatedValue: z.string().optional(),
});

export const noteBodySchema = z
  .string()
  .trim()
  .min(1, "Note cannot be empty")
  .max(NOTE_MAX_LENGTH, `Note must be at most ${NOTE_MAX_LENGTH} characters`);

/** Validate a follow-up datetime string (ISO or datetime-local). */
export function parseFollowUpDate(
  input: string | null | undefined,
): { ok: true; date: Date | null } | { ok: false; error: string } {
  if (input == null) return { ok: true, date: null };
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return { ok: true, date: null };
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "Enter a valid follow-up date" };
  }
  return { ok: true, date };
}
