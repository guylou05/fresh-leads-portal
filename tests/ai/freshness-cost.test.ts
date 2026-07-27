import { describe, expect, it } from "vitest";
import { isAnalysisStale } from "@/lib/ai/freshness";
import { estimateCostCents, estimateTokens } from "@/lib/ai/cost";

describe("analysis freshness", () => {
  it("is fresh when fingerprints match", () => {
    expect(isAnalysisStale("abc", "abc")).toBe(false);
  });
  it("is stale when fingerprints differ", () => {
    expect(isAnalysisStale("abc", "xyz")).toBe(true);
  });
});

describe("cost estimation", () => {
  it("estimates tokens roughly by length", () => {
    expect(estimateTokens("x".repeat(400))).toBe(100);
  });
  it("returns null cost when pricing is unknown (default env)", () => {
    expect(estimateCostCents(1000, 1000)).toBeNull();
  });
});
