"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AiJobType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { recordActivity } from "@/lib/leads/activity";
import { AiError } from "@/lib/ai/errors";
import {
  cancelAiJob,
  createAiJob,
  getAiSettings,
  resolveAiScopeRecordIds,
  type AiJobOptions,
} from "@/lib/ai/service";
import { sanitizeFilters } from "@/lib/leads/query";
import { setPriority, qualifyLead, disqualifyLead } from "@/app/(app)/leads/actions";

export type AiActionResult = { ok: boolean; error?: string; message?: string; jobId?: string };

function fail(error: unknown): AiActionResult {
  if (error instanceof AuthzError) return { ok: false, error: error.message };
  if (error instanceof AiError) return { ok: false, error: error.message };
  console.error("[ai.action] failed", error instanceof Error ? error.message : "unknown");
  return { ok: false, error: "Something went wrong. Please try again." };
}

function revalidateLead(businessRecordId: string) {
  revalidatePath(`/leads/${businessRecordId}`);
  revalidatePath("/ai");
  revalidatePath("/ai/review");
}

const createSchema = z.object({
  scope: z.enum(["SINGLE_LEAD", "SELECTED_LEADS", "FILTERED_RESULTS", "IMPORT_BATCH", "SAVED_SEGMENT"]),
  businessRecordIds: z.array(z.string()).optional(),
  importBatchId: z.string().optional(),
  savedSegmentId: z.string().optional(),
  filters: z.record(z.string(), z.string()).optional(),
  jobType: z.enum(["CLASSIFICATION", "SCORING", "RECOMMENDATIONS", "OUTREACH", "FULL_ANALYSIS"]),
  generateDrafts: z.boolean().optional(),
  skipFresh: z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
  reviewThreshold: z.number().int().min(0).max(100).optional(),
  maxLeads: z.number().int().positive().nullable().optional(),
});

export async function createAiJobAction(
  input: z.infer<typeof createSchema>,
): Promise<AiActionResult> {
  try {
    const user = await requireUser();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid request." };
    const settings = await getAiSettings();

    const options: AiJobOptions = {
      jobType: parsed.data.jobType as AiJobType,
      generateDrafts: parsed.data.generateDrafts ?? parsed.data.jobType === "OUTREACH",
      skipFresh: parsed.data.skipFresh ?? true,
      forceRefresh: parsed.data.forceRefresh ?? false,
      reviewThreshold: parsed.data.reviewThreshold ?? settings.reviewConfidenceThreshold,
      maxLeads: parsed.data.maxLeads ?? null,
    };

    const recordIds = await resolveAiScopeRecordIds({
      scope: parsed.data.scope,
      businessRecordIds: parsed.data.businessRecordIds,
      importBatchId: parsed.data.importBatchId,
      savedSegmentId: parsed.data.savedSegmentId,
      filters: parsed.data.filters ? sanitizeFilters(parsed.data.filters) : {},
      limit: settings.maxBatchSize,
    });

    const result = await createAiJob({ userId: user.id, scope: parsed.data.scope, options, recordIds });
    revalidatePath("/ai");
    return { ok: true, jobId: result.jobId, message: `Queued ${result.queued} lead(s)${result.skipped ? `, skipped ${result.skipped} fresh` : ""}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function analyzeSingleLeadAction(
  businessRecordId: string,
  opts: { generateDrafts?: boolean; forceRefresh?: boolean } = {},
): Promise<AiActionResult> {
  try {
    const user = await requireUser();
    const settings = await getAiSettings();
    const result = await createAiJob({
      userId: user.id,
      scope: "SINGLE_LEAD",
      options: {
        jobType: opts.generateDrafts ? "FULL_ANALYSIS" : "FULL_ANALYSIS",
        generateDrafts: opts.generateDrafts ?? false,
        skipFresh: !opts.forceRefresh,
        forceRefresh: opts.forceRefresh ?? false,
        reviewThreshold: settings.reviewConfidenceThreshold,
        maxLeads: 1,
      },
      recordIds: [businessRecordId],
    });
    revalidateLead(businessRecordId);
    return { ok: true, jobId: result.jobId, message: "AI analysis queued." };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelAiJobAction(jobId: string): Promise<AiActionResult> {
  try {
    const user = await requireUser();
    await cancelAiJob(jobId, user.id);
    revalidatePath("/ai");
    revalidatePath(`/ai/jobs/${jobId}`);
    return { ok: true, message: "Job cancelled." };
  } catch (error) {
    return fail(error);
  }
}

async function loadAnalysis(analysisId: string) {
  return prisma.aiAnalysis.findUnique({ where: { id: analysisId } });
}

export async function approveAnalysisAction(analysisId: string): Promise<AiActionResult> {
  try {
    const user = await requireUser();
    const analysis = await loadAnalysis(analysisId);
    if (!analysis) return { ok: false, error: "Analysis not found." };
    await prisma.aiAnalysis.update({
      where: { id: analysisId },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), rejectedById: null, rejectedAt: null },
    });
    await recordAudit({ userId: user.id, action: "ai.analysis.approved", entityType: "AiAnalysis", entityId: analysisId });
    if (analysis.leadProfileId) {
      await recordActivity(prisma, { leadProfileId: analysis.leadProfileId, actorId: user.id, activityType: "CONTACT_UPDATED", title: "AI analysis approved" });
    }
    revalidateLead(analysis.businessRecordId);
    return { ok: true, message: "Analysis approved." };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectAnalysisAction(analysisId: string, reason: string): Promise<AiActionResult> {
  try {
    const user = await requireUser();
    const analysis = await loadAnalysis(analysisId);
    if (!analysis) return { ok: false, error: "Analysis not found." };
    await prisma.aiAnalysis.update({
      where: { id: analysisId },
      data: { status: "REJECTED", rejectedById: user.id, rejectedAt: new Date(), rejectionReason: reason.trim().slice(0, 500) || null },
    });
    await recordAudit({ userId: user.id, action: "ai.analysis.rejected", entityType: "AiAnalysis", entityId: analysisId });
    if (analysis.leadProfileId) {
      await recordActivity(prisma, { leadProfileId: analysis.leadProfileId, actorId: user.id, activityType: "CONTACT_UPDATED", title: "AI analysis rejected" });
    }
    revalidateLead(analysis.businessRecordId);
    return { ok: true, message: "Analysis rejected." };
  } catch (error) {
    return fail(error);
  }
}

export async function markAnalysisStaleAction(analysisId: string): Promise<AiActionResult> {
  try {
    await requireUser();
    const analysis = await loadAnalysis(analysisId);
    if (!analysis) return { ok: false, error: "Analysis not found." };
    await prisma.aiAnalysis.update({ where: { id: analysisId }, data: { status: "STALE" } });
    revalidateLead(analysis.businessRecordId);
    return { ok: true, message: "Marked stale." };
  } catch (error) {
    return fail(error);
  }
}

/** Apply the AI priority recommendation to the LeadProfile (explicit user action). */
export async function applyPriorityRecommendationAction(analysisId: string): Promise<AiActionResult> {
  try {
    await requireUser();
    const analysis = await loadAnalysis(analysisId);
    if (!analysis?.priorityRecommendation) return { ok: false, error: "No priority recommendation." };
    const result = await setPriority(analysis.businessRecordId, analysis.priorityRecommendation as "LOW" | "NORMAL" | "HIGH" | "URGENT");
    revalidateLead(analysis.businessRecordId);
    return result.ok ? { ok: true, message: "Priority applied." } : { ok: false, error: result.error };
  } catch (error) {
    return fail(error);
  }
}

/** Apply the AI qualification recommendation (explicit user action). */
export async function applyQualificationRecommendationAction(analysisId: string): Promise<AiActionResult> {
  try {
    await requireUser();
    const analysis = await loadAnalysis(analysisId);
    if (!analysis?.qualificationRecommendation) return { ok: false, error: "No qualification recommendation." };
    const rec = analysis.qualificationRecommendation;
    if (rec === "QUALIFY") {
      const r = await qualifyLead(analysis.businessRecordId);
      if (!r.ok) return { ok: false, error: r.error };
    } else if (rec === "DISQUALIFY") {
      const r = await disqualifyLead(analysis.businessRecordId, analysis.qualificationReason ?? "AI-recommended disqualification");
      if (!r.ok) return { ok: false, error: r.error };
    } else {
      return { ok: false, error: "This recommendation is not directly applicable." };
    }
    revalidateLead(analysis.businessRecordId);
    return { ok: true, message: "Qualification applied." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Outreach drafts
// ---------------------------------------------------------------------------

const editDraftSchema = z.object({
  draftId: z.string().min(1),
  subject: z.string().max(160).optional(),
  body: z.string().min(1).max(4000),
  callToAction: z.string().max(300).optional(),
});

export async function editDraftAction(input: z.infer<typeof editDraftSchema>): Promise<AiActionResult> {
  try {
    const user = await requireUser();
    const parsed = editDraftSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const draft = await prisma.aiOutreachDraft.findUnique({ where: { id: parsed.data.draftId } });
    if (!draft) return { ok: false, error: "Draft not found." };
    await prisma.aiOutreachDraft.update({
      where: { id: draft.id },
      data: { subject: parsed.data.subject ?? draft.subject, body: parsed.data.body, callToAction: parsed.data.callToAction ?? draft.callToAction, status: "EDITED", editedById: user.id, editedAt: new Date() },
    });
    if (draft.leadProfileId) {
      await recordActivity(prisma, { leadProfileId: draft.leadProfileId, actorId: user.id, activityType: "CONTACT_UPDATED", title: "Outreach draft edited" });
    }
    revalidateLead(draft.businessRecordId);
    return { ok: true, message: "Draft saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function setDraftStatusAction(
  draftId: string,
  status: "APPROVED" | "REJECTED" | "ARCHIVED",
): Promise<AiActionResult> {
  try {
    const user = await requireUser();
    const draft = await prisma.aiOutreachDraft.findUnique({ where: { id: draftId } });
    if (!draft) return { ok: false, error: "Draft not found." };
    await prisma.aiOutreachDraft.update({
      where: { id: draftId },
      data: {
        status,
        ...(status === "APPROVED" ? { approvedById: user.id, approvedAt: new Date() } : {}),
        ...(status === "REJECTED" ? { rejectedById: user.id, rejectedAt: new Date() } : {}),
      },
    });
    if (draft.leadProfileId && status === "APPROVED") {
      await recordActivity(prisma, { leadProfileId: draft.leadProfileId, actorId: user.id, activityType: "CONTACT_UPDATED", title: "Outreach draft approved" });
    }
    revalidateLead(draft.businessRecordId);
    return { ok: true, message: `Draft ${status.toLowerCase()}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function generateDraftsAction(businessRecordId: string): Promise<AiActionResult> {
  return analyzeSingleLeadAction(businessRecordId, { generateDrafts: true, forceRefresh: false });
}
