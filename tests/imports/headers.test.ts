import { describe, expect, it } from "vitest";
import { analyzeHeaders, buildFieldIndex } from "@/lib/imports/headers";

describe("header mapping", () => {
  it("maps business-name header variations to the same field", () => {
    for (const variant of [
      "BUSINESS NAME",
      "Business Name",
      "business_name",
      "BUSINESSNAME",
    ]) {
      const analysis = analyzeHeaders([variant]);
      expect(analysis.hasBusinessName).toBe(true);
      expect(analysis.mapping[0]?.field).toBe("businessName");
    }
  });

  it("flags a missing business-name column", () => {
    const analysis = analyzeHeaders(["COUNTY", "EFFECTIVE DATE"]);
    expect(analysis.hasBusinessName).toBe(false);
  });

  it("keeps unknown columns without failing", () => {
    const analysis = analyzeHeaders(["BUSINESS NAME", "MYSTERY COLUMN"]);
    expect(analysis.hasBusinessName).toBe(true);
    expect(analysis.unknownHeaders).toContain("MYSTERY COLUMN");
  });

  it("handles duplicate headers safely (first occurrence wins)", () => {
    const analysis = analyzeHeaders(["BUSINESS NAME", "Business Name"]);
    const businessMappings = analysis.mapping.filter(
      (m) => m.field === "businessName",
    );
    expect(businessMappings).toHaveLength(1);
    expect(businessMappings[0]?.index).toBe(0);
  });

  it("builds a field index from the mapping", () => {
    const analysis = analyzeHeaders([
      "DOCUMENT NUMBER",
      "BUSINESS NAME",
      "COUNTY",
    ]);
    const index = buildFieldIndex(analysis);
    expect(index.businessName).toBe(1);
    expect(index.county).toBe(2);
    expect(index.documentNumber).toBe(0);
  });
});
