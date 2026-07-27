import { describe, expect, it } from "vitest";
import {
  classifyMatch,
  scoreGoogleCandidate,
  type GoogleCandidate,
} from "@/lib/enrichment/matching";
import type { LeadEnrichmentInput } from "@/lib/enrichment/types";

const input: LeadEnrichmentInput = {
  businessRecordId: "b1",
  businessName: "Buckeye Ventures LLC",
  normalizedBusinessName: "BUCKEYE VENTURES LLC",
  entityType: "Domestic LLC",
  filingAddress1: "123 Main St",
  filingCity: "Columbus",
  filingState: "OH",
  filingZip: "43215",
  businessCity: "Columbus",
  county: "Franklin",
  manualWebsite: null,
  manualPhone: null,
};

function candidate(overrides: Partial<GoogleCandidate>): GoogleCandidate {
  return {
    placeId: "p1",
    name: "Buckeye Ventures LLC",
    city: "Columbus",
    state: "OH",
    zip: "43215",
    address: "123 Main St, Columbus, OH 43215",
    website: null,
    phone: null,
    businessStatus: "OPERATIONAL",
    types: ["point_of_interest"],
    ...overrides,
  };
}

describe("google candidate scoring", () => {
  it("scores an exact name + city + ZIP match highly", () => {
    const scored = scoreGoogleCandidate(input, candidate({}));
    expect(scored.score).toBeGreaterThanOrEqual(80);
    expect(scored.reasons).toContain("Exact business-name match");
  });
  it("penalizes a different state", () => {
    const scored = scoreGoogleCandidate(input, candidate({ state: "TX", zip: "75001", city: "Dallas" }));
    expect(scored.penalties).toContain("Different state");
    expect(scored.score).toBeLessThan(60);
  });
  it("penalizes a permanently closed listing", () => {
    const scored = scoreGoogleCandidate(input, candidate({ businessStatus: "CLOSED_PERMANENTLY" }));
    expect(scored.penalties).toContain("Listing not operational");
  });
});

describe("match classification", () => {
  it("classifies a single strong candidate as HIGH", () => {
    const scored = [scoreGoogleCandidate(input, candidate({}))];
    expect(classifyMatch(scored).classification).toBe("HIGH_CONFIDENCE");
  });
  it("classifies two close strong candidates as MULTIPLE_POSSIBLE_MATCHES", () => {
    const scored = [
      scoreGoogleCandidate(input, candidate({ placeId: "a" })),
      scoreGoogleCandidate(input, candidate({ placeId: "b" })),
    ];
    expect(classifyMatch(scored).classification).toBe("MULTIPLE_POSSIBLE_MATCHES");
  });
  it("classifies an empty candidate list as NO_MATCH", () => {
    expect(classifyMatch([]).classification).toBe("NO_MATCH");
  });
});
