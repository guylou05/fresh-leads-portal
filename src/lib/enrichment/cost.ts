import { env } from "@/env";
import type { EnrichmentOperations } from "@/lib/enrichment/types";

export type CostEstimate = {
  leads: number;
  googleCallsPerLead: number;
  websiteRequestsPerLead: number;
  expectedGoogleCalls: number;
  expectedWebsiteRequests: number;
  /** null when the per-call price is unknown (show request counts instead). */
  estimatedCostCents: number | null;
  estimatedSecondsMin: number;
  estimatedSecondsMax: number;
};

/**
 * Estimate provider usage for a job. Google pricing is NOT hard-coded — it
 * comes from GOOGLE_PLACES_COST_PER_CALL_CENTS; when 0 the cost is unknown and
 * we surface request counts rather than a false estimate.
 */
export function estimateJobCost(
  leads: number,
  operations: EnrichmentOperations,
  websitePageLimit: number,
): CostEstimate {
  const googleCallsPerLead = operations.googlePlaces ? 2 : 0; // text search + details
  const websiteRequestsPerLead =
    (operations.websiteDiscovery ? 1 : 0) +
    (operations.websiteCrawl ? websitePageLimit : 0);

  const expectedGoogleCalls = leads * googleCallsPerLead;
  const expectedWebsiteRequests = leads * websiteRequestsPerLead;

  const perCall = env.GOOGLE_PLACES_COST_PER_CALL_CENTS;
  const estimatedCostCents =
    perCall > 0 ? Math.round(expectedGoogleCalls * perCall) : null;

  // Rough processing-time envelope (crawl delay dominates); never promised exact.
  const perLeadSeconds = 2 + websiteRequestsPerLead * 1.5;
  return {
    leads,
    googleCallsPerLead,
    websiteRequestsPerLead,
    expectedGoogleCalls,
    expectedWebsiteRequests,
    estimatedCostCents,
    estimatedSecondsMin: Math.round(leads * perLeadSeconds * 0.5),
    estimatedSecondsMax: Math.round(leads * perLeadSeconds * 1.5),
  };
}

export function formatCentsUsd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
