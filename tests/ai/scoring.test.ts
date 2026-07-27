import { describe, expect, it } from "vitest";
import type { BusinessEnrichment, BusinessRecord } from "@prisma/client";
import { computeLeadScore } from "@/lib/ai/scoring";

function record(overrides: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    filingState: "OH",
    county: "Hamilton",
    effectiveDate: new Date(),
    ...overrides,
  } as unknown as BusinessRecord;
}
function enrichment(overrides: Partial<BusinessEnrichment> = {}): BusinessEnrichment {
  return { phoneVerifiedAt: null, emailVerifiedAt: null, websiteVerifiedAt: null, overallConfidence: null, googleBusinessStatus: null, publicEmail: null, ...overrides } as unknown as BusinessEnrichment;
}

describe("deterministic lead scoring", () => {
  it("gives full geography for the Cincinnati service area", () => {
    const r = computeLeadScore({ record: record({ filingState: "OH", county: "Hamilton" }), enrichment: null, aiBusinessFit: 0, aiTechnologyOpportunity: 0 });
    expect(r.subScores.geography).toBe(20);
  });

  it("penalizes out-of-state and caps the score", () => {
    const r = computeLeadScore({ record: record({ filingState: "TX", county: "Dallas" }), enrichment: null, aiBusinessFit: 20, aiTechnologyOpportunity: 20 });
    expect(r.subScores.geography).toBe(0);
    expect(r.finalScore).toBeLessThanOrEqual(40);
    expect(r.warnings).toContain("Outside the target service area");
  });

  it("scores contactability from verified signals only", () => {
    const r = computeLeadScore({
      record: record(),
      enrichment: enrichment({ phoneVerifiedAt: new Date(), emailVerifiedAt: new Date(), publicEmail: "a@b.com", websiteVerifiedAt: new Date() }),
      aiBusinessFit: 0, aiTechnologyOpportunity: 0,
    });
    expect(r.subScores.contactability).toBe(20);
  });

  it("derives confidence quality from enrichment confidence", () => {
    const high = computeLeadScore({ record: record(), enrichment: enrichment({ overallConfidence: 90 }), aiBusinessFit: 0, aiTechnologyOpportunity: 0 });
    const low = computeLeadScore({ record: record(), enrichment: enrichment({ overallConfidence: 30 }), aiBusinessFit: 0, aiTechnologyOpportunity: 0 });
    expect(high.subScores.confidenceQuality).toBe(10);
    expect(low.subScores.confidenceQuality).toBe(2);
  });

  it("clamps AI-influenced sub-scores to 0..20", () => {
    const r = computeLeadScore({ record: record(), enrichment: null, aiBusinessFit: 999, aiTechnologyOpportunity: -5 });
    expect(r.subScores.businessFit).toBe(20);
    expect(r.subScores.technologyOpportunity).toBe(0);
  });

  it("caps score for a permanently closed listing", () => {
    const r = computeLeadScore({ record: record(), enrichment: enrichment({ googleBusinessStatus: "CLOSED_PERMANENTLY", overallConfidence: 90 }), aiBusinessFit: 20, aiTechnologyOpportunity: 20 });
    expect(r.finalScore).toBeLessThanOrEqual(25);
  });
});
