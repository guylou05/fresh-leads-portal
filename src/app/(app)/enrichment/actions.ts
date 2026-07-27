"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EnrichmentScope } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { getOrCreateProfile } from "@/lib/leads/profile";
import { recordActivity } from "@/lib/leads/activity";
import { EnrichmentError } from "@/lib/enrichment/errors";
import {
  cancelEnrichmentJob,
  createEnrichmentJob,
  getEnrichmentSettings,
  resolveScopeRecordIds,
} from "@/lib/enrichment/service";
import { DEFAULT_OPERATIONS, type EnrichmentOptions } from "@/lib/enrichment/types";
import { sanitizeFilters } from "@/lib/leads/query";

export type EnrichActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  jobId?: string;
};

function fail(error: unknown): EnrichActionResult {
  if (error instanceof AuthzError) return { ok: false, error: error.message };
  if (error instanceof EnrichmentError) return { ok: false, error: error.message };
  console.error(
    "[enrichment.action] failed",
    error instanceof Error ? error.message : "unknown error",
  );
  return { ok: false, error: "Something went wrong. Please try again." };
}

const operationsSchema = z.object({
  googlePlaces: z.boolean(),
  websiteDiscovery: z.boolean(),
  websiteCrawl: z.boolean(),
  phone: z.boolean(),
  email: z.boolean(),
  social: z.boolean(),
});

const createJobSchema = z.object({
  scope: z.enum(["SELECTED_LEADS", "FILTERED_RESULTS", "IMPORT_BATCH", "SINGLE_LEAD"]),
  businessRecordIds: z.array(z.string()).optional(),
  importBatchId: z.string().optional(),
  filters: z.record(z.string(), z.string()).optional(),
  operations: operationsSchema.optional(),
  skipRecentlyEnriched: z.boolean().optional(),
  cacheDays: z.number().int().positive().optional(),
  retryFailed: z.boolean().optional(),
  maxLeads: z.number().int().positive().nullable().optional(),
  reviewConfidenceThreshold: z.number().int().min(0).max(100).optional(),
  forceRefresh: z.boolean().optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

export async function createEnrichmentJobAction(
  input: CreateJobInput,
): Promise<EnrichActionResult> {
  try {
    const user = await requireUser();
    const parsed = createJobSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid enrichment request." };
    const settings = await getEnrichmentSettings();

    const options: EnrichmentOptions = {
      operations: parsed.data.operations ?? DEFAULT_OPERATIONS,
      skipRecentlyEnriched: parsed.data.skipRecentlyEnriched ?? true,
      cacheDays: parsed.data.cacheDays ?? settings.cacheDays,
      retryFailed: parsed.data.retryFailed ?? false,
      maxLeads: parsed.data.maxLeads ?? null,
      reviewConfidenceThreshold:
        parsed.data.reviewConfidenceThreshold ?? settings.reviewConfidenceThreshold,
      forceRefresh: parsed.data.forceRefresh ?? false,
    };

    const recordIds = await resolveScopeRecordIds({
      scope: parsed.data.scope as EnrichmentScope,
      businessRecordIds: parsed.data.businessRecordIds,
      importBatchId: parsed.data.importBatchId,
      filters: parsed.data.filters ? sanitizeFilters(parsed.data.filters) : {},
      limit: settings.maxLeadsPerJob,
    });

    const result = await createEnrichmentJob({
      userId: user.id,
      scope: parsed.data.scope as EnrichmentScope,
      options,
      recordIds,
    });

    revalidatePath("/enrichment");
    return {
      ok: true,
      jobId: result.jobId,
      message: `Queued ${result.queued} lead(s)${result.skipped ? `, skipped ${result.skipped} fresh` : ""}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelEnrichmentJobAction(
  jobId: string,
): Promise<EnrichActionResult> {
  try {
    const user = await requireUser();
    await cancelEnrichmentJob(jobId, user.id);
    revalidatePath("/enrichment");
    revalidatePath(`/enrichment/${jobId}`);
    return { ok: true, message: "Job cancelled." };
  } catch (error) {
    return fail(error);
  }
}

/** Re-enrich a single lead (used by single-lead enrich, retry, review). */
export async function enrichSingleLeadAction(
  businessRecordId: string,
  forceRefresh = true,
): Promise<EnrichActionResult> {
  try {
    const user = await requireUser();
    const result = await createEnrichmentJob({
      userId: user.id,
      scope: "SINGLE_LEAD",
      options: {
        operations: DEFAULT_OPERATIONS,
        skipRecentlyEnriched: !forceRefresh,
        cacheDays: (await getEnrichmentSettings()).cacheDays,
        retryFailed: true,
        maxLeads: 1,
        reviewConfidenceThreshold: (await getEnrichmentSettings()).reviewConfidenceThreshold,
        forceRefresh,
      },
      recordIds: [businessRecordId],
    });
    revalidatePath(`/leads/${businessRecordId}`);
    revalidatePath("/enrichment");
    return { ok: true, jobId: result.jobId, message: "Enrichment queued." };
  } catch (error) {
    return fail(error);
  }
}

const overrideSchema = z.object({
  businessRecordId: z.string().min(1),
  field: z.enum(["website", "phone", "publicEmail"]),
  value: z.string().trim().max(2048),
});

/** Manually set/correct an enriched field. Marked as a manual override. */
export async function manualOverrideAction(
  input: z.infer<typeof overrideSchema>,
): Promise<EnrichActionResult> {
  try {
    const user = await requireUser();
    const parsed = overrideSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid input." };
    const { businessRecordId, field, value } = parsed.data;

    const now = new Date();
    const data: Record<string, unknown> = { manualReviewRequired: false, lastEnrichedAt: now };
    if (field === "website") {
      data.website = value || null;
      data.websiteSource = "Manual override";
      data.websiteConfidence = value ? 100 : null;
      data.websiteVerifiedAt = value ? now : null;
    } else if (field === "phone") {
      data.phone = value || null;
      data.phoneSource = "Manual override";
      data.phoneConfidence = value ? 100 : null;
    } else {
      data.publicEmail = value || null;
      data.emailSource = "Manual override";
      data.emailConfidence = value ? 100 : null;
    }

    await prisma.businessEnrichment.upsert({
      where: { businessRecordId },
      create: { businessRecordId, enrichmentStatus: "PARTIAL", ...data },
      update: data,
    });
    await recordAudit({
      userId: user.id,
      action: "enrichment.manual.override",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
      metadata: { field },
    });
    await addLeadActivityIfProfile(businessRecordId, `${field} manually overridden`);
    revalidatePath(`/leads/${businessRecordId}`);
    revalidatePath("/enrichment/review");
    return { ok: true, message: "Manual value saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function markReviewedAction(
  businessRecordId: string,
): Promise<EnrichActionResult> {
  try {
    const user = await requireUser();
    await prisma.businessEnrichment.update({
      where: { businessRecordId },
      data: { manualReviewRequired: false, enrichmentStatus: "ENRICHED" },
    });
    await recordAudit({
      userId: user.id,
      action: "enrichment.manual.candidate.accepted",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
    });
    await addLeadActivityIfProfile(businessRecordId, "Enrichment manually reviewed");
    revalidatePath("/enrichment/review");
    revalidatePath(`/leads/${businessRecordId}`);
    return { ok: true, message: "Marked reviewed." };
  } catch (error) {
    return fail(error);
  }
}

/** Clear automated enrichment for a lead (privacy) — removes raw source data. */
export async function clearEnrichmentAction(
  businessRecordId: string,
): Promise<EnrichActionResult> {
  try {
    const user = await requireUser();
    await prisma.$transaction(async (tx) => {
      await tx.enrichmentSourceRecord.deleteMany({ where: { businessRecordId } });
      await tx.websiteCrawlResult.deleteMany({ where: { businessRecordId } });
      await tx.businessEnrichment.deleteMany({ where: { businessRecordId } });
    });
    await recordAudit({
      userId: user.id,
      action: "enrichment.result.cleared",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
    });
    await addLeadActivityIfProfile(businessRecordId, "Automated enrichment cleared");
    revalidatePath(`/leads/${businessRecordId}`);
    revalidatePath("/enrichment/review");
    return { ok: true, message: "Enrichment data cleared." };
  } catch (error) {
    return fail(error);
  }
}

const copySchema = z.object({
  businessRecordId: z.string().min(1),
  field: z.enum(["website", "phone", "email"]),
});

/** Explicitly copy an enriched value into the manual LeadProfile. */
export async function copyToProfileAction(
  input: z.infer<typeof copySchema>,
): Promise<EnrichActionResult> {
  try {
    const user = await requireUser();
    const parsed = copySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid input." };
    const enrichment = await prisma.businessEnrichment.findUnique({
      where: { businessRecordId: parsed.data.businessRecordId },
    });
    if (!enrichment) return { ok: false, error: "No enrichment data to copy." };

    const value =
      parsed.data.field === "website" ? enrichment.website :
      parsed.data.field === "phone" ? enrichment.phone :
      enrichment.publicEmail;
    if (!value) return { ok: false, error: "That field has no enriched value." };

    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, parsed.data.businessRecordId, user.id);
      const data =
        parsed.data.field === "website" ? { website: value } :
        parsed.data.field === "phone" ? { primaryPhone: value } :
        { primaryEmail: value.toLowerCase() };
      await tx.leadProfile.update({ where: { id: profile.id }, data: { ...data, updatedById: user.id } });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "CONTACT_UPDATED",
        title: `Enriched ${parsed.data.field} copied to lead profile`,
      });
    });
    await recordAudit({
      userId: user.id,
      action: "enrichment.field.copied",
      entityType: "BusinessRecord",
      entityId: parsed.data.businessRecordId,
      metadata: { field: parsed.data.field },
    });
    revalidatePath(`/leads/${parsed.data.businessRecordId}`);
    return { ok: true, message: `Copied ${parsed.data.field} to lead profile.` };
  } catch (error) {
    return fail(error);
  }
}

async function addLeadActivityIfProfile(
  businessRecordId: string,
  title: string,
): Promise<void> {
  const profile = await prisma.leadProfile.findUnique({
    where: { businessRecordId },
    select: { id: true },
  });
  if (profile) {
    await recordActivity(prisma, {
      leadProfileId: profile.id,
      activityType: "CONTACT_UPDATED",
      title,
    });
  }
}
