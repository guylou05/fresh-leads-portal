import { z } from "zod";
import { MAX_BULK_SELECTION } from "@/lib/leads/constants";
import { AuthzError } from "@/lib/authz";

export const BULK_ACTIONS = [
  "status",
  "priority",
  "assign",
  "unassign",
  "addTag",
  "removeTag",
  "setFollowUp",
  "clearFollowUp",
  "archive",
  "restore",
  "qualify",
  "disqualify",
] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Actions that must be explicitly confirmed by the user. */
const CONFIRM_REQUIRED = new Set<BulkAction>(["archive", "disqualify"]);

export function requiresConfirmation(action: BulkAction): boolean {
  return CONFIRM_REQUIRED.has(action);
}

export const bulkActionSchema = z.object({
  action: z.enum(BULK_ACTIONS),
  ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_SELECTION),
  expectedCount: z.number().int().nonnegative(),
  value: z.string().optional(),
  confirmed: z.boolean().optional(),
});

export type BulkActionInput = z.infer<typeof bulkActionSchema>;

/**
 * Guard: the number of records the server is about to touch must equal the
 * count shown to (and confirmed by) the user. Prevents silently updating more
 * records than the confirmation stated.
 */
export function assertConfirmationCount(
  ids: string[],
  expectedCount: number,
): void {
  if (ids.length !== expectedCount) {
    throw new AuthzError(
      "The selection changed. Please review and confirm again.",
    );
  }
}

/** Any authenticated user may run standard bulk actions. */
export function assertCanBulkUpdate(user: { id: string } | null | undefined): void {
  if (!user) {
    throw new AuthzError("You must be signed in to perform bulk actions.");
  }
}
