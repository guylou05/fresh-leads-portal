import { describe, expect, it } from "vitest";
import { estimateJobCost, formatCentsUsd } from "@/lib/enrichment/cost";
import type { EnrichmentOperations } from "@/lib/enrichment/types";

const allOps: EnrichmentOperations = {
  googlePlaces: true,
  websiteDiscovery: true,
  websiteCrawl: true,
  phone: true,
  email: true,
  social: true,
};

describe("cost estimation", () => {
  it("counts google + website requests per lead", () => {
    const est = estimateJobCost(10, allOps, 5);
    expect(est.googleCallsPerLead).toBe(2);
    expect(est.websiteRequestsPerLead).toBe(1 + 5);
    expect(est.expectedGoogleCalls).toBe(20);
    expect(est.expectedWebsiteRequests).toBe(60);
  });
  it("returns null cost when per-call price is unknown (default env)", () => {
    const est = estimateJobCost(10, allOps, 5);
    expect(est.estimatedCostCents).toBeNull();
  });
  it("formats cents as USD", () => {
    expect(formatCentsUsd(12345)).toBe("$123.45");
    expect(formatCentsUsd(null)).toBe("—");
  });
});
