import crypto from "node:crypto";
import type {
  BusinessEnrichment,
  BusinessRecord,
  LeadProfile,
  Tag,
} from "@prisma/client";
import { SOURCE_TYPES } from "@/lib/ai/schemas";

export type SourceType = (typeof SOURCE_TYPES)[number];

export type ContextField = {
  field: string;
  value: string;
  sourceType: SourceType;
};

export type AiContext = {
  fields: ContextField[];
  /** Human-readable, source-labeled text block for the prompt (untrusted data). */
  text: string;
  /** Fingerprint over the relevant data only (excludes prompt/model). */
  contentFingerprint: string;
  /** Fingerprint including prompt version + model (used for stale detection). */
  fingerprint: string;
};

/** Strip control chars, collapse whitespace, and cap length of untrusted text. */
export function sanitizeUntrusted(value: string | null | undefined, max = 500): string | null {
  if (value == null) return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

type BuildInput = {
  record: BusinessRecord;
  enrichment: BusinessEnrichment | null;
  profile: (LeadProfile & { tags?: { tag: Pick<Tag, "name"> }[] }) | null;
  notesSummary?: string | null;
};

/**
 * Build a compact, source-labeled AI context using only available data. Never
 * includes secrets, raw HTML, full provider payloads, or full note history.
 */
export function buildAiContext(
  input: BuildInput,
  opts: { promptVersion: string; model: string },
): AiContext {
  const { record, enrichment, profile } = input;
  const fields: ContextField[] = [];
  const add = (field: string, value: string | null | undefined, sourceType: SourceType) => {
    const clean = sanitizeUntrusted(value);
    if (clean) fields.push({ field, value: clean, sourceType });
  };

  // Official filing data
  add("businessName", record.businessName, "official_filing");
  add("entityType", record.entityType, "official_filing");
  add("effectiveDate", record.effectiveDate ? record.effectiveDate.toISOString().slice(0, 10) : null, "official_filing");
  add("businessCity", record.businessCity, "official_filing");
  add("county", record.county, "official_filing");
  add("filingState", record.filingState, "official_filing");
  add("filingAddress", [record.filingAddress1, record.filingCity, record.filingState, record.filingZip].filter(Boolean).join(", "), "official_filing");
  add("transactionDescription", record.transactionDescription, "official_filing");
  add("associateNames", record.associateNamesRaw, "official_filing");

  // Verified enrichment data (only when verified/present)
  if (enrichment) {
    if (enrichment.websiteVerifiedAt) add("website", enrichment.website, "verified_enrichment");
    add("googlePrimaryCategory", enrichment.googlePrimaryCategory, "verified_enrichment");
    add("googleBusinessStatus", enrichment.googleBusinessStatus, "verified_enrichment");
    add("googleAddress", enrichment.googleAddress, "verified_enrichment");
    if (enrichment.phoneVerifiedAt) add("verifiedPhone", enrichment.phone, "verified_enrichment");
    if (enrichment.emailVerifiedAt) add("publicEmail", enrichment.publicEmail, "verified_enrichment");
    if (enrichment.overallConfidence != null) add("enrichmentConfidence", String(enrichment.overallConfidence), "verified_enrichment");
    const socials = [enrichment.facebookUrl, enrichment.linkedinUrl, enrichment.instagramUrl].filter(Boolean);
    if (socials.length) add("socialLinks", socials.join(", "), "verified_enrichment");
  }

  // Manual sales data
  if (profile) {
    add("manualContactName", profile.primaryContactName, "manual_user");
    add("customIndustry", profile.customIndustry, "manual_user");
    add("leadStatus", profile.status, "manual_user");
    add("leadPriority", profile.priority, "manual_user");
    const tags = profile.tags?.map((t) => t.tag.name).join(", ");
    add("tags", tags ?? null, "manual_user");
  }
  add("notesSummary", input.notesSummary ?? null, "manual_user");

  const text = fields
    .map((f) => `- [${f.sourceType}] ${f.field}: ${f.value}`)
    .join("\n");

  const contentFingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(fields))
    .digest("hex")
    .slice(0, 32);
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${contentFingerprint}|${opts.promptVersion}|${opts.model}`)
    .digest("hex")
    .slice(0, 32);

  return { fields, text, contentFingerprint, fingerprint };
}
