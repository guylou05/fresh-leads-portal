import { describe, expect, it } from "vitest";
import type { BusinessEnrichment, BusinessRecord, LeadProfile } from "@prisma/client";
import { buildAiContext, sanitizeUntrusted } from "@/lib/ai/context-builder";

function record(overrides: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    businessName: "Buckeye Ventures LLC",
    normalizedBusinessName: "BUCKEYE VENTURES LLC",
    entityType: "Domestic LLC",
    effectiveDate: new Date("2026-01-05T12:00:00Z"),
    businessCity: "Columbus",
    county: "Franklin",
    filingState: "OH",
    filingAddress1: "123 Main St",
    filingCity: "Columbus",
    filingZip: "43215",
    transactionDescription: "DOMESTIC LIMITED LIABILITY COMPANY",
    associateNamesRaw: "Jane Doe",
    ...overrides,
  } as unknown as BusinessRecord;
}

const opts = { promptVersion: "v1", model: "gpt-4o-mini" };

describe("context builder", () => {
  it("labels each field with its source", () => {
    const ctx = buildAiContext({ record: record(), enrichment: null, profile: null }, opts);
    const business = ctx.fields.find((f) => f.field === "businessName");
    expect(business?.sourceType).toBe("official_filing");
    expect(ctx.text).toContain("[official_filing] businessName: Buckeye Ventures LLC");
  });

  it("marks verified enrichment separately from manual data", () => {
    const enrichment = { website: "https://x.com", websiteVerifiedAt: new Date(), googlePrimaryCategory: "Dentist" } as unknown as BusinessEnrichment;
    const profile = { primaryContactName: "Owner", status: "REVIEWING", priority: "HIGH", customIndustry: "Dentistry" } as unknown as LeadProfile;
    const ctx = buildAiContext({ record: record(), enrichment, profile }, opts);
    expect(ctx.fields.find((f) => f.field === "website")?.sourceType).toBe("verified_enrichment");
    expect(ctx.fields.find((f) => f.field === "customIndustry")?.sourceType).toBe("manual_user");
  });

  it("produces a stable fingerprint for identical inputs", () => {
    const a = buildAiContext({ record: record(), enrichment: null, profile: null }, opts);
    const b = buildAiContext({ record: record(), enrichment: null, profile: null }, opts);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("changes the fingerprint when relevant data changes", () => {
    const a = buildAiContext({ record: record(), enrichment: null, profile: null }, opts);
    const b = buildAiContext({ record: record({ businessCity: "Cleveland" }), enrichment: null, profile: null }, opts);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("changes the fingerprint when the prompt version or model changes", () => {
    const a = buildAiContext({ record: record(), enrichment: null, profile: null }, opts);
    const b = buildAiContext({ record: record(), enrichment: null, profile: null }, { ...opts, promptVersion: "v2" });
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.contentFingerprint).toBe(b.contentFingerprint); // content unchanged
  });

  it("sanitizes untrusted text (strips control chars, caps length)", () => {
    expect(sanitizeUntrusted("hello\u0000\nworld")).toBe("hello world");
    expect(sanitizeUntrusted("x".repeat(600), 100)?.length).toBe(101); // 100 + ellipsis
  });
});
