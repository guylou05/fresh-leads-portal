import { extractDomain, normalizePhone } from "@/lib/enrichment/normalization";
import type { LeadEnrichmentInput } from "@/lib/enrichment/types";

/** Documented Google match score thresholds (0..100). */
export const MATCH_THRESHOLDS = {
  HIGH: 80,
  MEDIUM: 60,
  LOW: 40,
  /** Score gap below which two strong candidates are "multiple possible". */
  AMBIGUITY_GAP: 10,
} as const;

export type GoogleCandidate = {
  placeId: string;
  name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  businessStatus: string | null;
  types: string[];
};

export type MatchClassification =
  | "HIGH_CONFIDENCE"
  | "MEDIUM_CONFIDENCE"
  | "LOW_CONFIDENCE"
  | "NO_MATCH"
  | "MULTIPLE_POSSIBLE_MATCHES";

export type ScoredCandidate = {
  candidate: GoogleCandidate;
  score: number;
  reasons: string[];
  penalties: string[];
};

const NAME_STOPWORDS = new Set([
  "llc", "inc", "incorporated", "corp", "corporation", "co", "company",
  "ltd", "limited", "the", "and", "&", "of", "group", "holdings",
]);

/** Tokenize a business name into meaningful lowercase tokens. */
export function tokenizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NAME_STOPWORDS.has(t));
}

function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((t) => setB.has(t)).length;
  return shared / Math.max(a.length, b.length);
}

function eqCI(a: string | null, b: string | null): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

/**
 * Score a Google candidate against the filing/lead data. Never auto-selects on
 * position; scoring + classification decide. Rating/reviews are NOT used.
 */
export function scoreGoogleCandidate(
  input: LeadEnrichmentInput,
  candidate: GoogleCandidate,
): ScoredCandidate {
  const reasons: string[] = [];
  const penalties: string[] = [];
  let score = 0;

  const inputTokens = tokenizeName(input.normalizedBusinessName || input.businessName);
  const candTokens = tokenizeName(candidate.name);
  const exactName =
    inputTokens.length > 0 &&
    inputTokens.join(" ") === candTokens.join(" ");
  const overlap = tokenOverlap(inputTokens, candTokens);

  if (exactName) {
    score += 40;
    reasons.push("Exact business-name match");
  } else if (overlap >= 0.6) {
    score += 25;
    reasons.push("Strong business-name overlap");
  } else if (overlap > 0) {
    score += Math.round(overlap * 15);
  } else {
    penalties.push("Business name does not match");
    score -= 20;
  }

  const inputCity = input.businessCity ?? input.filingCity;
  if (eqCI(candidate.city, inputCity)) {
    score += 15;
    reasons.push("City matches");
  }
  if (eqCI(candidate.zip, input.filingZip)) {
    score += 15;
    reasons.push("ZIP matches");
  }
  if (eqCI(candidate.state, input.filingState)) {
    score += 5;
    reasons.push("State matches");
  } else if (candidate.state && input.filingState) {
    score -= 30;
    penalties.push("Different state");
  }

  if (candidate.address && input.filingAddress1) {
    const addrOverlap = tokenOverlap(
      tokenizeName(candidate.address),
      tokenizeName(input.filingAddress1),
    );
    if (addrOverlap >= 0.5) {
      score += 10;
      reasons.push("Address similarity");
    }
  }

  const inputDomain = extractDomain(input.manualWebsite);
  const candDomain = extractDomain(candidate.website);
  if (inputDomain && candDomain && inputDomain === candDomain) {
    score += 15;
    reasons.push("Website domain agrees");
  }

  const inputPhone = normalizePhone(input.manualPhone);
  const candPhone = normalizePhone(candidate.phone);
  if (inputPhone && candPhone && inputPhone === candPhone) {
    score += 15;
    reasons.push("Phone agrees");
  }

  if (candidate.businessStatus && candidate.businessStatus !== "OPERATIONAL") {
    score -= 25;
    penalties.push("Listing not operational");
  }

  if (!eqCI(candidate.city, inputCity) && !eqCI(candidate.zip, input.filingZip)) {
    score -= 10;
    penalties.push("Different city and ZIP");
  }

  return { candidate, score: Math.max(0, Math.min(100, score)), reasons, penalties };
}

/** Classify a set of scored candidates into a match confidence bucket. */
export function classifyMatch(scored: ScoredCandidate[]): {
  classification: MatchClassification;
  best: ScoredCandidate | null;
  alternatives: ScoredCandidate[];
} {
  if (scored.length === 0) {
    return { classification: "NO_MATCH", best: null, alternatives: [] };
  }
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const best = sorted[0]!;
  const alternatives = sorted.slice(1);

  const strongContenders = sorted.filter(
    (s) => s.score >= MATCH_THRESHOLDS.MEDIUM &&
      best.score - s.score <= MATCH_THRESHOLDS.AMBIGUITY_GAP,
  );
  if (strongContenders.length >= 2) {
    return { classification: "MULTIPLE_POSSIBLE_MATCHES", best, alternatives };
  }

  if (best.score >= MATCH_THRESHOLDS.HIGH) {
    return { classification: "HIGH_CONFIDENCE", best, alternatives };
  }
  if (best.score >= MATCH_THRESHOLDS.MEDIUM) {
    return { classification: "MEDIUM_CONFIDENCE", best, alternatives };
  }
  if (best.score >= MATCH_THRESHOLDS.LOW) {
    return { classification: "LOW_CONFIDENCE", best, alternatives };
  }
  return { classification: "NO_MATCH", best: null, alternatives };
}
