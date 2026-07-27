import { describe, expect, it } from "vitest";
import { computeOverallConfidence } from "@/lib/enrichment/confidence";
import { addDays, isFresh, isStale } from "@/lib/enrichment/cache";
import { buildLeadJobKey, operationsToStrategy } from "@/lib/enrichment/jobs";
import type { EnrichmentOperations } from "@/lib/enrichment/types";

const ops: EnrichmentOperations = {
  googlePlaces: true,
  websiteDiscovery: true,
  websiteCrawl: true,
  phone: true,
  email: true,
  social: true,
};

describe("overall confidence", () => {
  it("is high with strong website + phone and no conflicts", () => {
    const r = computeOverallConfidence(
      { websiteConfidence: 90, phoneConfidence: 95, emailConfidence: 85, googleMatch: "HIGH_CONFIDENCE", websiteVerified: true, hasEmail: true, conflicts: [], sourceCount: 3 },
      60,
    );
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.needsReview).toBe(false);
  });
  it("requires review on multiple possible matches", () => {
    const r = computeOverallConfidence(
      { websiteConfidence: null, phoneConfidence: null, emailConfidence: null, googleMatch: "MULTIPLE_POSSIBLE_MATCHES", websiteVerified: false, hasEmail: false, conflicts: [], sourceCount: 0 },
      60,
    );
    expect(r.needsReview).toBe(true);
    expect(r.explanation).toMatch(/multiple/i);
  });
  it("flags a phone conflict", () => {
    const r = computeOverallConfidence(
      { websiteConfidence: 80, phoneConfidence: 75, emailConfidence: null, googleMatch: "HIGH_CONFIDENCE", websiteVerified: true, hasEmail: false, conflicts: ["Phone conflict between Google and website"], sourceCount: 2 },
      60,
    );
    expect(r.needsReview).toBe(true);
    expect(r.explanation).toMatch(/phone/i);
  });
});

describe("cache freshness", () => {
  const now = new Date("2026-07-27T00:00:00Z");
  it("treats recent results as fresh", () => {
    expect(isFresh(addDays(now, -5), 30, now)).toBe(true);
    expect(isStale(addDays(now, -5), 30, now)).toBe(false);
  });
  it("treats old results as stale", () => {
    expect(isFresh(addDays(now, -40), 30, now)).toBe(false);
    expect(isStale(addDays(now, -40), 30, now)).toBe(true);
  });
});

describe("job idempotency key", () => {
  it("is stable for identical inputs", () => {
    const base = { businessRecordId: "b1", operations: ops, providerStrategy: "gp+wd", cacheDays: 30, sourceVersion: "v1" };
    expect(buildLeadJobKey(base)).toBe(buildLeadJobKey({ ...base }));
  });
  it("changes when the source version (force refresh) changes", () => {
    const a = buildLeadJobKey({ businessRecordId: "b1", operations: ops, providerStrategy: "gp", cacheDays: 30, sourceVersion: "v1" });
    const b = buildLeadJobKey({ businessRecordId: "b1", operations: ops, providerStrategy: "gp", cacheDays: 30, sourceVersion: "v2" });
    expect(a).not.toBe(b);
  });
  it("serializes operations deterministically", () => {
    expect(operationsToStrategy(ops)).toBe("gp+wd+wc+ph+em+so");
  });
});
