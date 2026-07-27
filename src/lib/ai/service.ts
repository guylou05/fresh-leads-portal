import type { AiJobType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { recordAudit } from "@/lib/audit";
import { recordActivity } from "@/lib/leads/activity";
import { buildLeadWhere, sanitizeFilters, type LeadFilters } from "@/lib/leads/query";
import { buildAiContext } from "@/lib/ai/context-builder";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import { generateAnalysis, generateDraft } from "@/lib/ai/client";
import { computeLeadScore } from "@/lib/ai/scoring";
import { estimateCostCents, estimateTokens } from "@/lib/ai/cost";
import { AiError } from "@/lib/ai/errors";
import { getAiQueue, type AiJobData } from "@/lib/ai/queue";
import type { AiStructuredOutput } from "@/lib/ai/schemas";

const TERMINAL_ERRORS = new Set([
  "AI_DISABLED", "MISSING_API_KEY", "DAILY_LIMIT_REACHED",
  "COST_LIMIT_REACHED", "OUTPUT_VALIDATION_FAILED", "STALE_INPUT",
]);

export type AiJobOptions = {
  jobType: AiJobType;
  generateDrafts: boolean;
  skipFresh: boolean;
  forceRefresh: boolean;
  reviewThreshold: number;
  maxLeads: number | null;
};

export async function getAiSettings() {
  const existing = await prisma.aiSettings.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return prisma.aiSettings.create({
    data: {
      id: "singleton",
      classificationModel: env.OPENAI_MODEL_CLASSIFICATION,
      outreachModel: env.OPENAI_MODEL_OUTREACH,
      dailyLeadLimit: env.AI_DAILY_LEAD_LIMIT,
      maxBatchSize: env.AI_MAX_BATCH_SIZE,
      retryLimit: env.AI_MAX_RETRIES,
      costCeilingCents: env.AI_COST_CEILING_CENTS,
      promptVersion: env.AI_PROMPT_VERSION,
      aiEnabled: env.AI_ENABLED === "true",
    },
  });
}

export function parseAiOptions(raw: Prisma.JsonValue | null): AiJobOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    jobType: (o.jobType as AiJobType) ?? "FULL_ANALYSIS",
    generateDrafts: Boolean(o.generateDrafts ?? false),
    skipFresh: Boolean(o.skipFresh ?? true),
    forceRefresh: Boolean(o.forceRefresh ?? false),
    reviewThreshold: Number(o.reviewThreshold ?? 60),
    maxLeads: o.maxLeads == null ? null : Number(o.maxLeads),
  };
}

export async function resolveAiScopeRecordIds(params: {
  scope: string;
  businessRecordIds?: string[];
  importBatchId?: string;
  savedSegmentId?: string;
  filters?: LeadFilters;
  limit: number;
}): Promise<string[]> {
  const { scope, businessRecordIds, importBatchId, savedSegmentId, filters, limit } = params;
  if (scope === "SINGLE_LEAD" || scope === "SELECTED_LEADS") {
    return (businessRecordIds ?? []).slice(0, limit);
  }
  if (scope === "IMPORT_BATCH" && importBatchId) {
    const rows = await prisma.businessRecord.findMany({ where: { importBatchId }, select: { id: true }, take: limit });
    return rows.map((r) => r.id);
  }
  if (scope === "SAVED_SEGMENT" && savedSegmentId) {
    const seg = await prisma.savedSegment.findUnique({ where: { id: savedSegmentId } });
    const segFilters = seg ? sanitizeFilters(seg.filters) : {};
    const rows = await prisma.businessRecord.findMany({ where: buildLeadWhere(segFilters), select: { id: true }, take: limit });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.businessRecord.findMany({ where: buildLeadWhere(filters ?? {}), select: { id: true }, take: limit });
  return rows.map((r) => r.id);
}

function startOfToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
export async function countAiLeadsToday(): Promise<number> {
  return prisma.aiLeadJob.count({ where: { createdAt: { gte: startOfToday() } } });
}

/** Build the source-labeled AI context for a record. */
export async function buildContextForRecord(businessRecordId: string, model: string) {
  const record = await prisma.businessRecord.findUnique({
    where: { id: businessRecordId },
    include: {
      enrichment: true,
      leadProfile: { include: { tags: { select: { tag: { select: { name: true } } } } } },
    },
  });
  if (!record) throw new AiError("UNKNOWN_ERROR", "Record not found");
  const notes = record.leadProfile
    ? await prisma.leadNote.findMany({ where: { leadProfileId: record.leadProfile.id }, orderBy: { createdAt: "desc" }, take: 3, select: { body: true } })
    : [];
  const notesSummary = notes.map((n) => n.body).join(" | ").slice(0, 400) || null;
  const context = buildAiContext(
    { record, enrichment: record.enrichment, profile: record.leadProfile, notesSummary },
    { promptVersion: PROMPT_VERSION, model },
  );
  return { record, context };
}

export async function createAiJob(params: {
  userId: string;
  scope: string;
  options: AiJobOptions;
  recordIds: string[];
}): Promise<{ jobId: string; queued: number; skipped: number }> {
  const settings = await getAiSettings();
  if (!settings.aiEnabled || env.AI_ENABLED !== "true") throw new AiError("AI_DISABLED");

  let recordIds = params.recordIds.slice(0, params.options.maxLeads ?? settings.maxBatchSize).slice(0, settings.maxBatchSize);
  const usedToday = await countAiLeadsToday();
  const remaining = Math.max(0, settings.dailyLeadLimit - usedToday);
  if (remaining <= 0) throw new AiError("DAILY_LIMIT_REACHED");
  recordIds = recordIds.slice(0, remaining);
  if (recordIds.length === 0) throw new AiError("UNKNOWN_ERROR", "No eligible leads.");

  const model = settings.classificationModel;

  // Compute fingerprints + skip fresh analyses.
  const leadInputs: { businessRecordId: string; fingerprint: string }[] = [];
  let skipped = 0;
  for (const id of recordIds) {
    const { context } = await buildContextForRecord(id, model);
    if (params.options.skipFresh && !params.options.forceRefresh) {
      const fresh = await prisma.aiAnalysis.findFirst({
        where: { businessRecordId: id, inputFingerprint: context.fingerprint, status: { in: ["COMPLETED", "APPROVED", "NEEDS_REVIEW"] } },
      });
      if (fresh) { skipped += 1; continue; }
    }
    leadInputs.push({ businessRecordId: id, fingerprint: context.fingerprint });
  }
  if (leadInputs.length === 0) throw new AiError("UNKNOWN_ERROR", "All selected leads already have fresh analyses.");

  const job = await prisma.aiJob.create({
    data: {
      requestedById: params.userId,
      jobType: params.options.jobType,
      status: "RUNNING",
      scope: params.scope,
      totalLeads: leadInputs.length,
      queuedLeads: leadInputs.length,
      skippedLeads: skipped,
      startedAt: new Date(),
      options: params.options as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.aiLeadJob.createMany({
    data: leadInputs.map((li) => ({
      aiJobId: job.id,
      businessRecordId: li.businessRecordId,
      inputFingerprint: li.fingerprint,
      status: "QUEUED",
    })),
  });
  const leadJobs = await prisma.aiLeadJob.findMany({ where: { aiJobId: job.id }, select: { id: true, businessRecordId: true, inputFingerprint: true } });

  const queue = getAiQueue();
  await queue.addBulk(
    leadJobs.map((lj) => ({
      name: "ai-analyze",
      data: { aiJobId: job.id, aiLeadJobId: lj.id, businessRecordId: lj.businessRecordId } satisfies AiJobData,
      // Use the unique lead-job id as the queue job id. Redundant-run prevention
      // (same lead + input fingerprint) is enforced by the skip-fresh DB check
      // above; force refresh deliberately bypasses it, so the queue id must be
      // unique per lead job to guarantee processing.
      opts: { jobId: lj.id },
    })),
  );

  await recordAudit({
    userId: params.userId,
    action: "ai.job.created",
    entityType: "AiJob",
    entityId: job.id,
    metadata: { scope: params.scope, jobType: params.options.jobType, leads: leadInputs.length, skipped },
  });

  return { jobId: job.id, queued: leadInputs.length, skipped };
}

export async function cancelAiJob(jobId: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.aiJob.update({ where: { id: jobId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await tx.aiLeadJob.updateMany({ where: { aiJobId: jobId, status: { in: ["QUEUED", "PROCESSING"] } }, data: { status: "CANCELLED" } });
  });
  await recordAudit({ userId, action: "ai.job.cancelled", entityType: "AiJob", entityId: jobId });
}

async function bumpAiParent(
  jobId: string,
  bucket: "successfulLeads" | "reviewLeads" | "failedLeads" | "skippedLeads",
  tokens: { input: number; output: number; cents: number },
): Promise<void> {
  await prisma.aiJob.update({
    where: { id: jobId },
    data: {
      processedLeads: { increment: 1 },
      [bucket]: { increment: 1 },
      inputTokens: { increment: tokens.input },
      outputTokens: { increment: tokens.output },
      ...(tokens.cents > 0 ? { actualCostCents: { increment: tokens.cents } } : {}),
    },
  });
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (job && job.status !== "CANCELLED" && job.processedLeads >= job.totalLeads) {
    await prisma.aiJob.update({
      where: { id: jobId },
      data: { status: job.failedLeads > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED", completedAt: new Date() },
    });
  }
}

/** Process a single AI lead job: analyze, score, persist, optionally draft. */
export async function processAiLeadJob(aiLeadJobId: string): Promise<void> {
  const leadJob = await prisma.aiLeadJob.findUnique({ where: { id: aiLeadJobId }, include: { aiJob: true } });
  if (!leadJob) return;
  if (leadJob.aiJob.status === "CANCELLED") {
    await prisma.aiLeadJob.update({ where: { id: aiLeadJobId }, data: { status: "CANCELLED", completedAt: new Date() } });
    return;
  }

  const settings = await getAiSettings();
  const options = parseAiOptions(leadJob.aiJob.options);

  if (settings.costCeilingCents > 0 && (leadJob.aiJob.actualCostCents ?? 0) >= settings.costCeilingCents) {
    await prisma.aiLeadJob.update({ where: { id: aiLeadJobId }, data: { status: "SKIPPED", failureCode: "COST_LIMIT_REACHED", completedAt: new Date() } });
    await bumpAiParent(leadJob.aiJobId, "skippedLeads", { input: 0, output: 0, cents: 0 });
    return;
  }

  await prisma.aiLeadJob.update({ where: { id: aiLeadJobId }, data: { status: "PROCESSING", startedAt: new Date(), attemptCount: { increment: 1 } } });

  try {
    const { record, context } = await buildContextForRecord(leadJob.businessRecordId, settings.classificationModel);
    const analysis = await generateAnalysis(context, { model: settings.classificationModel, temperature: env.AI_DEFAULT_TEMPERATURE });
    const out: AiStructuredOutput = analysis.output;

    const score = computeLeadScore({
      record,
      enrichment: record.enrichment,
      aiBusinessFit: out.businessFitScore,
      aiTechnologyOpportunity: out.technologyOpportunityScore,
    });

    const needsReview =
      out.industryConfidence < options.reviewThreshold ||
      out.segment === "Needs Manual Review" ||
      out.qualificationRecommendation === "INSUFFICIENT_DATA" ||
      out.warnings.length >= 3;

    const cents = estimateCostCents(analysis.usage.inputTokens, analysis.usage.outputTokens) ?? 0;

    const created = await prisma.aiAnalysis.create({
      data: {
        businessRecordId: record.id,
        leadProfileId: record.leadProfile?.id ?? null,
        businessEnrichmentId: record.enrichment?.id ?? null,
        status: needsReview ? "NEEDS_REVIEW" : "COMPLETED",
        promptVersion: PROMPT_VERSION,
        model: analysis.model,
        inputFingerprint: leadJob.inputFingerprint,
        industry: out.industry,
        industryConfidence: out.industryConfidence,
        businessType: out.businessType,
        businessTypeConfidence: out.businessTypeConfidence,
        segment: out.segment,
        segmentConfidence: out.segmentConfidence,
        leadScore: score.finalScore,
        leadScoreExplanation: [...score.deterministicReasons].slice(0, 6).join("; "),
        priorityRecommendation: score.priorityRecommendation,
        qualificationRecommendation: out.qualificationRecommendation,
        qualificationReason: out.qualificationReason,
        recommendedServices: out.recommendedServices as unknown as Prisma.InputJsonValue,
        outreachAngles: out.outreachAngles as unknown as Prisma.InputJsonValue,
        evidence: out.evidence as unknown as Prisma.InputJsonValue,
        warnings: [...out.warnings, ...score.warnings] as unknown as Prisma.InputJsonValue,
        rawStructuredOutput: { output: out, scoring: score } as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.aiUsage.create({
      data: {
        aiJobId: leadJob.aiJobId,
        businessRecordId: record.id,
        provider: analysis.stub ? "stub" : "openai",
        model: analysis.model,
        operation: "analysis",
        inputTokens: analysis.usage.inputTokens,
        outputTokens: analysis.usage.outputTokens,
        estimatedCostCents: cents,
      },
    });

    let draftTokens = { input: 0, output: 0, cents: 0 };
    if (options.generateDrafts) {
      const draftTypes = ["COLD_EMAIL", "CALL_OPENER", "VOICEMAIL", "FOLLOW_UP_EMAIL"] as const;
      for (const draftType of draftTypes) {
        try {
          const d = await generateDraft(context, { draftType, tone: "Consultative", angle: out.outreachAngles[0]?.angle ?? null, model: settings.outreachModel, temperature: env.AI_DEFAULT_TEMPERATURE });
          await prisma.aiOutreachDraft.create({
            data: {
              businessRecordId: record.id,
              aiAnalysisId: created.id,
              leadProfileId: record.leadProfile?.id ?? null,
              draftType,
              tone: d.output.tone,
              subject: d.output.subject ?? null,
              body: d.output.body,
              originalBody: d.output.body,
              callToAction: d.output.callToAction ?? null,
              promptVersion: PROMPT_VERSION,
              model: d.model,
              generatedByJobId: leadJob.aiJobId,
              status: "GENERATED",
            },
          });
          const dc = estimateCostCents(d.usage.inputTokens, d.usage.outputTokens) ?? 0;
          draftTokens = { input: draftTokens.input + d.usage.inputTokens, output: draftTokens.output + d.usage.outputTokens, cents: draftTokens.cents + dc };
        } catch {
          /* one draft failing should not fail the whole lead */
        }
      }
    }

    if (record.leadProfile) {
      await recordActivity(prisma, {
        leadProfileId: record.leadProfile.id,
        activityType: "CONTACT_UPDATED",
        title: needsReview ? "AI analysis completed — needs review" : "AI analysis completed",
        description: `Industry: ${out.industry} · Score: ${score.finalScore} · ${analysis.stub ? "stub model" : analysis.model}`,
      });
    }

    await bumpAiParent(leadJob.aiJobId, needsReview ? "reviewLeads" : "successfulLeads", {
      input: analysis.usage.inputTokens + draftTokens.input,
      output: analysis.usage.outputTokens + draftTokens.output,
      cents: cents + draftTokens.cents,
    });
    await prisma.aiLeadJob.update({ where: { id: aiLeadJobId }, data: { status: needsReview ? "NEEDS_REVIEW" : "SUCCESS", completedAt: new Date() } });
  } catch (error) {
    const code = error instanceof AiError ? error.code : "UNKNOWN_ERROR";
    await prisma.aiLeadJob.update({ where: { id: aiLeadJobId }, data: { status: "FAILED", failureCode: code, completedAt: new Date() } });
    await bumpAiParent(leadJob.aiJobId, "failedLeads", { input: 0, output: 0, cents: 0 });
    if (!TERMINAL_ERRORS.has(code)) throw error; // retryable → let BullMQ back off
  }
}

/** Pre-run estimate for the job-creation UI. */
export function estimateAiJob(leadCount: number, generateDrafts: boolean, avgContextChars = 600) {
  const callsPerLead = 1 + (generateDrafts ? 4 : 0);
  const inputTokensPerLead = estimateTokens("x".repeat(avgContextChars)) + 400; // context + prompt
  const outputTokensPerLead = 500 + (generateDrafts ? 600 : 0);
  const inputTokens = leadCount * inputTokensPerLead;
  const outputTokens = leadCount * outputTokensPerLead;
  return {
    leads: leadCount,
    expectedModelCalls: leadCount * callsPerLead,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostCents: estimateCostCents(inputTokens, outputTokens),
  };
}
