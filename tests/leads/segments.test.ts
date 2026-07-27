import { describe, expect, it } from "vitest";
import { segmentInputSchema, validateSegmentFilters } from "@/lib/segments";

describe("segment filter validation", () => {
  it("keeps only supported filter keys", () => {
    const filters = validateSegmentFilters({
      county: "Butler",
      status: "NEW",
      dangerous: "DROP TABLE",
      randomKey: 1,
    });
    expect(filters).toEqual({ county: "Butler", status: "NEW" });
  });

  it("returns empty for non-object input", () => {
    expect(validateSegmentFilters(null)).toEqual({});
    expect(validateSegmentFilters("string")).toEqual({});
  });
});

describe("segment input schema", () => {
  it("defaults to PRIVATE visibility", () => {
    const result = segmentInputSchema.parse({ name: "My segment" });
    expect(result.visibility).toBe("PRIVATE");
  });
  it("rejects an empty name", () => {
    expect(segmentInputSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("rejects invalid visibility", () => {
    expect(
      segmentInputSchema.safeParse({ name: "x", visibility: "PUBLIC" }).success,
    ).toBe(false);
  });
});
