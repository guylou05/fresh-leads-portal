import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { sanitizeFilters, type LeadFilters } from "@/lib/leads/query";

export const segmentNameSchema = z
  .string()
  .trim()
  .min(1, "Segment name is required")
  .max(120, "Segment name is too long");

export const segmentInputSchema = z.object({
  name: segmentNameSchema,
  description: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim().length === 0 ? null : v),
      z.string().max(500).nullable(),
    )
    .optional(),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("PRIVATE"),
});

/**
 * Validate and whitelist a segment's saved filters. Unsupported/obsolete keys
 * are dropped so stored JSON can never drive arbitrary queries.
 */
export function validateSegmentFilters(input: unknown): LeadFilters {
  return sanitizeFilters(input);
}

/** Store filters as a Prisma JSON value (already whitelisted). */
export function filtersToJson(filters: LeadFilters): Prisma.InputJsonValue {
  return filters as Prisma.InputJsonValue;
}
