import { z } from "zod";
import { TAG_COLOR_VALUES, type TagColor } from "@/lib/leads/constants";

/** Case-insensitive, whitespace-collapsed normalized form for uniqueness. */
export function normalizeTagName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag name is required")
  .max(50, "Tag name must be at most 50 characters");

export const tagColorSchema = z
  .enum(TAG_COLOR_VALUES as [TagColor, ...TagColor[]])
  .default("slate");

export const tagInputSchema = z.object({
  name: tagNameSchema,
  description: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim().length === 0 ? null : v),
      z.string().max(200).nullable(),
    )
    .optional(),
  color: tagColorSchema,
});
