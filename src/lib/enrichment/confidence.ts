import type { MatchClassification } from "@/lib/enrichment/matching";

export function clampConfidence(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export type EnrichmentSignals = {
  websiteConfidence: number | null;
  phoneConfidence: number | null;
  emailConfidence: number | null;
  googleMatch: MatchClassification | null;
  websiteVerified: boolean;
  hasEmail: boolean;
  conflicts: string[];
  sourceCount: number;
};

const MATCH_BASE: Record<MatchClassification, number> = {
  HIGH_CONFIDENCE: 80,
  MEDIUM_CONFIDENCE: 55,
  LOW_CONFIDENCE: 35,
  MULTIPLE_POSSIBLE_MATCHES: 40,
  NO_MATCH: 0,
};

/**
 * Combine field-level confidences + match signals into an overall 0..100 score,
 * a short user-facing explanation, and whether manual review is warranted.
 */
export function computeOverallConfidence(
  signals: EnrichmentSignals,
  reviewThreshold: number,
): { score: number; explanation: string; needsReview: boolean } {
  const fieldScores = [
    signals.websiteConfidence,
    signals.phoneConfidence,
    signals.emailConfidence,
  ].filter((v): v is number => typeof v === "number");

  let score = 0;
  if (fieldScores.length > 0) {
    score = fieldScores.reduce((a, b) => a + b, 0) / fieldScores.length;
  } else if (signals.googleMatch) {
    score = MATCH_BASE[signals.googleMatch];
  }

  // Multiple agreeing sources raise confidence slightly.
  if (signals.sourceCount >= 2) score += 5;
  // Conflicts reduce confidence.
  score -= signals.conflicts.length * 15;

  const finalScore = clampConfidence(score);

  let explanation: string;
  if (signals.googleMatch === "MULTIPLE_POSSIBLE_MATCHES") {
    explanation = "Multiple possible Google listings require review.";
  } else if (signals.conflicts.some((c) => c.toLowerCase().includes("phone"))) {
    explanation = "Phone conflicts between Google and website.";
  } else if (signals.conflicts.some((c) => c.toLowerCase().includes("website"))) {
    explanation = "Conflicting website evidence requires review.";
  } else if (signals.websiteVerified && !signals.hasEmail) {
    explanation = "Website verified, but no public email found.";
  } else if (finalScore >= 80) {
    explanation = "Strong name, location, and website match.";
  } else if (finalScore >= 60) {
    explanation = "Good match with some supporting evidence.";
  } else if (finalScore > 0) {
    explanation = "Only low-confidence information found.";
  } else {
    explanation = "No confident business information found.";
  }

  const needsReview =
    signals.googleMatch === "MULTIPLE_POSSIBLE_MATCHES" ||
    signals.conflicts.length > 0 ||
    (finalScore > 0 && finalScore < reviewThreshold);

  return { score: finalScore, explanation, needsReview };
}
