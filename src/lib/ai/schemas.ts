import { z } from "zod";

// ---------------------------------------------------------------------------
// Taxonomies (closed vocabularies the model must stay within)
// ---------------------------------------------------------------------------

export const PRIMARY_INDUSTRIES = [
  "Accounting", "Automotive", "Beauty and Personal Care", "Childcare",
  "Construction", "Dental", "Education", "Financial Services",
  "Food and Beverage", "Government", "Healthcare", "Home Services",
  "Hospitality", "Insurance", "IT and Technology", "Legal", "Manufacturing",
  "Nonprofit", "Professional Services", "Property Management", "Real Estate",
  "Retail", "Transportation and Logistics", "Wellness and Fitness",
  "Other", "Unknown",
] as const;

export const BUSINESS_TYPES = [
  "Professional office", "Retail storefront", "Medical office",
  "Home-based business", "Mobile service business", "Contractor",
  "Nonprofit organization", "Association", "Restaurant or food service",
  "Technology company", "Property-based business", "Unknown",
] as const;

export const SEGMENTS = [
  "Managed IT Prospect", "Security Camera Prospect",
  "Business Email Setup Prospect", "Website Setup Prospect",
  "Website Improvement Prospect", "Computer Equipment Prospect",
  "Network and Wi-Fi Prospect", "Data Backup Prospect",
  "Nonprofit Technology Prospect", "Professional Office Prospect",
  "Retail Technology Prospect", "Low-Confidence Lead",
  "Low-Priority or Home-Based Lead", "Needs Manual Review",
] as const;

export const SERVICE_CATALOG = [
  "Managed IT Support", "Microsoft 365 Setup", "Google Workspace Setup",
  "Business Email Migration", "Business Wi-Fi and Networking",
  "Firewall and Cybersecurity Setup", "Security Camera Installation",
  "Access Control", "Computer and Laptop Procurement", "Workstation Setup",
  "Data Backup", "Cloud Backup", "Website Design", "Website Maintenance",
  "Domain and DNS Support", "Printer Setup and Support", "VoIP Phone Setup",
  "IT Consulting", "Nonprofit Technology Support",
] as const;

export const OUTREACH_TONES = [
  "Professional", "Friendly", "Direct", "Consultative", "Local and conversational",
] as const;

export const PRIORITY_VALUES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const QUALIFICATION_VALUES = [
  "QUALIFY", "REVIEW", "DISQUALIFY", "INSUFFICIENT_DATA",
] as const;
export const SOURCE_TYPES = [
  "official_filing", "verified_enrichment", "manual_user", "ai_inference",
] as const;

export const PROMPT_VERSION = "v1";

// ---------------------------------------------------------------------------
// Zod schemas for structured model output
// ---------------------------------------------------------------------------

const confidence = z.number().int().min(0).max(100);
const subScore = z.number().int().min(0).max(20);

export const evidenceItemSchema = z.object({
  field: z.string().min(1).max(80),
  value: z.string().max(400),
  sourceType: z.enum(SOURCE_TYPES),
  relevance: z.string().max(300),
});

export const recommendedServiceSchema = z.object({
  service: z.enum(SERVICE_CATALOG),
  priority: z.enum(PRIORITY_VALUES),
  confidence,
  rationale: z.string().max(400),
});

export const outreachAngleSchema = z.object({
  angle: z.string().max(120),
  why: z.string().max(400),
  confidence,
  cta: z.string().max(200),
});

/** The single structured object the analysis model must return. */
export const aiStructuredOutputSchema = z.object({
  industry: z.enum(PRIMARY_INDUSTRIES),
  industryConfidence: confidence,
  secondaryIndustries: z.array(z.enum(PRIMARY_INDUSTRIES)).max(3).default([]),
  businessType: z.enum(BUSINESS_TYPES),
  businessTypeConfidence: confidence,
  segment: z.enum(SEGMENTS),
  secondarySegments: z.array(z.enum(SEGMENTS)).max(4).default([]),
  segmentConfidence: confidence,
  businessFitScore: subScore,
  technologyOpportunityScore: subScore,
  recommendedServices: z.array(recommendedServiceSchema).max(6).default([]),
  qualificationRecommendation: z.enum(QUALIFICATION_VALUES),
  qualificationConfidence: confidence,
  qualificationReason: z.string().max(500),
  qualificationRisks: z.array(z.string().max(200)).max(6).default([]),
  qualificationNextStep: z.string().max(300),
  outreachAngles: z.array(outreachAngleSchema).min(1).max(4),
  evidence: z.array(evidenceItemSchema).max(20),
  warnings: z.array(z.string().max(200)).max(10).default([]),
});

export type AiStructuredOutput = z.infer<typeof aiStructuredOutputSchema>;

export const draftSchema = z.object({
  draftType: z.enum([
    "COLD_EMAIL", "FOLLOW_UP_EMAIL", "LINKEDIN_MESSAGE", "CALL_OPENER",
    "VOICEMAIL", "SMS_DRAFT", "INTERNAL_SUMMARY",
  ]),
  tone: z.enum(OUTREACH_TONES),
  subject: z.string().max(160).nullable().optional(),
  body: z.string().min(1).max(4000),
  callToAction: z.string().max(300).nullable().optional(),
});

export type DraftOutput = z.infer<typeof draftSchema>;
