import { describe, expect, it } from "vitest";
import {
  aiStructuredOutputSchema,
  type AiStructuredOutput,
} from "@/lib/ai/schemas";

function valid(): AiStructuredOutput {
  return {
    industry: "Dental",
    industryConfidence: 80,
    secondaryIndustries: [],
    businessType: "Medical office",
    businessTypeConfidence: 70,
    segment: "Managed IT Prospect",
    secondarySegments: [],
    segmentConfidence: 65,
    businessFitScore: 15,
    technologyOpportunityScore: 12,
    recommendedServices: [
      { service: "Managed IT Support", priority: "HIGH", confidence: 70, rationale: "ok" },
    ],
    qualificationRecommendation: "REVIEW",
    qualificationConfidence: 60,
    qualificationReason: "reason",
    qualificationRisks: [],
    qualificationNextStep: "next",
    outreachAngles: [{ angle: "a", why: "b", confidence: 50, cta: "c" }],
    evidence: [{ field: "website", value: "https://x.com", sourceType: "verified_enrichment", relevance: "r" }],
    warnings: [],
  };
}

describe("AI structured output validation", () => {
  it("accepts a valid structured output", () => {
    expect(aiStructuredOutputSchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects out-of-range confidence", () => {
    expect(aiStructuredOutputSchema.safeParse({ ...valid(), industryConfidence: 150 }).success).toBe(false);
    expect(aiStructuredOutputSchema.safeParse({ ...valid(), industryConfidence: -1 }).success).toBe(false);
  });
  it("rejects out-of-range sub-score", () => {
    expect(aiStructuredOutputSchema.safeParse({ ...valid(), businessFitScore: 25 }).success).toBe(false);
  });
  it("rejects unsupported service", () => {
    const bad = { ...valid(), recommendedServices: [{ service: "Rocket Launches", priority: "HIGH", confidence: 50, rationale: "x" }] };
    expect(aiStructuredOutputSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects unsupported segment", () => {
    expect(aiStructuredOutputSchema.safeParse({ ...valid(), segment: "World Domination" }).success).toBe(false);
  });
  it("rejects more than 6 recommended services", () => {
    const svc = { service: "Managed IT Support", priority: "NORMAL", confidence: 50, rationale: "x" };
    expect(aiStructuredOutputSchema.safeParse({ ...valid(), recommendedServices: Array(7).fill(svc) }).success).toBe(false);
  });
  it("rejects unsupported qualification value", () => {
    expect(aiStructuredOutputSchema.safeParse({ ...valid(), qualificationRecommendation: "MAYBE" }).success).toBe(false);
  });
});
