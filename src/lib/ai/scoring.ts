import type { BusinessEnrichment, BusinessRecord } from "@prisma/client";

export type SubScores = {
  geography: number; // 0-20
  businessFit: number; // 0-20
  contactability: number; // 0-20
  technologyOpportunity: number; // 0-20
  freshnessTiming: number; // 0-10
  confidenceQuality: number; // 0-10
};

export type ScoreResult = {
  finalScore: number; // 0-100
  subScores: SubScores;
  deterministicReasons: string[];
  warnings: string[];
  priorityRecommendation: "LOW" | "NORMAL" | "HIGH" | "URGENT";
};

// VirtuoTech (Cincinnati) target region.
const TARGET_STATE = "OH";
const CINCINNATI_COUNTIES = new Set(["HAMILTON", "BUTLER", "WARREN", "CLERMONT"]);

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));

/**
 * Hybrid lead score: deterministic sub-scores (geography, contactability,
 * freshness, confidence) plus AI-influenced sub-scores (business fit, technology
 * opportunity) that the model may only *suggest* within [0,20]. AI never sets
 * the whole score.
 */
export function computeLeadScore(input: {
  record: BusinessRecord;
  enrichment: BusinessEnrichment | null;
  aiBusinessFit: number; // 0-20 (from model, clamped)
  aiTechnologyOpportunity: number; // 0-20 (from model, clamped)
  now?: Date;
}): ScoreResult {
  const { record, enrichment } = input;
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Geography (0-20)
  let geography = 0;
  const state = (record.filingState ?? "").toUpperCase();
  const county = (record.county ?? "").toUpperCase();
  if (state === TARGET_STATE) {
    geography = 12;
    reasons.push("Located in the target state (OH)");
    if (CINCINNATI_COUNTIES.has(county)) {
      geography += 8;
      reasons.push("In the Cincinnati service area");
    }
  } else if (state) {
    warnings.push("Outside the target service area");
  } else {
    geography = 8;
  }
  geography = clamp(geography, 0, 20);

  // Contactability (0-20)
  let contactability = 0;
  if (enrichment?.phoneVerifiedAt) { contactability += 8; reasons.push("Verified phone available"); }
  if (enrichment?.emailVerifiedAt && enrichment.publicEmail) { contactability += 7; reasons.push("Public business email available"); }
  if (enrichment?.websiteVerifiedAt) { contactability += 5; reasons.push("Verified website"); }
  if (contactability === 0) warnings.push("No verified contact information");
  contactability = clamp(contactability, 0, 20);

  // Freshness / timing (0-10)
  let freshnessTiming = 3;
  if (record.effectiveDate) {
    const ageDays = (now.getTime() - record.effectiveDate.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays <= 90) { freshnessTiming = 10; reasons.push("Recently registered business"); }
    else if (ageDays <= 365) freshnessTiming = 6;
    else freshnessTiming = 3;
  }

  // Confidence quality (0-10)
  let confidenceQuality = 2;
  const conf = enrichment?.overallConfidence ?? null;
  if (conf != null) {
    if (conf >= 80) confidenceQuality = 10;
    else if (conf >= 60) confidenceQuality = 7;
    else if (conf >= 40) confidenceQuality = 4;
    else confidenceQuality = 2;
  } else {
    warnings.push("No verified operating presence yet");
  }

  const businessFit = clamp(input.aiBusinessFit, 0, 20);
  const technologyOpportunity = clamp(input.aiTechnologyOpportunity, 0, 20);

  const subScores: SubScores = {
    geography,
    businessFit,
    contactability,
    technologyOpportunity,
    freshnessTiming,
    confidenceQuality,
  };

  let finalScore =
    geography + businessFit + contactability + technologyOpportunity +
    freshnessTiming + confidenceQuality;

  // Hard penalties.
  if (enrichment?.googleBusinessStatus && enrichment.googleBusinessStatus !== "OPERATIONAL") {
    warnings.push("Google lists the business as not operational");
    finalScore = Math.min(finalScore, 25);
  }
  if (state && state !== TARGET_STATE) {
    finalScore = Math.min(finalScore, 40);
  }

  finalScore = clamp(finalScore, 0, 100);

  const priorityRecommendation =
    finalScore >= 85 ? "URGENT" :
    finalScore >= 70 ? "HIGH" :
    finalScore >= 45 ? "NORMAL" : "LOW";

  return { finalScore, subScores, deterministicReasons: reasons, warnings, priorityRecommendation };
}
