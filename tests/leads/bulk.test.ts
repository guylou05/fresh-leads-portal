import { describe, expect, it } from "vitest";
import {
  assertCanBulkUpdate,
  assertConfirmationCount,
  bulkActionSchema,
  requiresConfirmation,
} from "@/lib/leads/bulk-actions";
import { AuthzError } from "@/lib/authz";

describe("bulk action confirmation", () => {
  it("requires confirmation for destructive actions", () => {
    expect(requiresConfirmation("archive")).toBe(true);
    expect(requiresConfirmation("disqualify")).toBe(true);
    expect(requiresConfirmation("status")).toBe(false);
  });

  it("throws when the selection count changed", () => {
    expect(() => assertConfirmationCount(["a", "b"], 3)).toThrow(AuthzError);
    expect(() => assertConfirmationCount(["a", "b"], 2)).not.toThrow();
  });

  it("requires an authenticated user", () => {
    expect(() => assertCanBulkUpdate(null)).toThrow(AuthzError);
    expect(() => assertCanBulkUpdate({ id: "u1" })).not.toThrow();
  });
});

describe("bulk action schema", () => {
  it("accepts a valid payload", () => {
    const result = bulkActionSchema.safeParse({
      action: "status",
      ids: ["a", "b"],
      expectedCount: 2,
      value: "REVIEWING",
    });
    expect(result.success).toBe(true);
  });
  it("rejects an empty selection", () => {
    expect(
      bulkActionSchema.safeParse({ action: "archive", ids: [], expectedCount: 0 })
        .success,
    ).toBe(false);
  });
  it("rejects an unknown action", () => {
    expect(
      bulkActionSchema.safeParse({ action: "nuke", ids: ["a"], expectedCount: 1 })
        .success,
    ).toBe(false);
  });
});
