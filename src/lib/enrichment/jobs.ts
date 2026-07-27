import crypto from "node:crypto";
import type { EnrichmentOperations } from "@/lib/enrichment/types";

const OP_CODES: Array<[keyof EnrichmentOperations, string]> = [
  ["googlePlaces", "gp"],
  ["websiteDiscovery", "wd"],
  ["websiteCrawl", "wc"],
  ["phone", "ph"],
  ["email", "em"],
  ["social", "so"],
];

/** Stable, order-independent string describing the requested operations. */
export function operationsToStrategy(ops: EnrichmentOperations): string {
  return OP_CODES.filter(([key]) => ops[key])
    .map(([, code]) => code)
    .join("+");
}

/**
 * Deterministic idempotency key for a per-lead enrichment operation. Identical
 * inputs (record + operations + strategy + cache window + source version)
 * produce the same key, preventing accidental duplicate jobs. A force refresh
 * varies `sourceVersion` (e.g. a timestamp) to intentionally bypass this.
 */
export function buildLeadJobKey(input: {
  businessRecordId: string;
  operations: EnrichmentOperations;
  providerStrategy: string;
  cacheDays: number;
  sourceVersion: string;
}): string {
  const payload = [
    input.businessRecordId,
    operationsToStrategy(input.operations),
    input.providerStrategy,
    String(input.cacheDays),
    input.sourceVersion,
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
