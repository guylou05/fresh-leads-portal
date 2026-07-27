-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "AiDraftType" AS ENUM ('COLD_EMAIL', 'FOLLOW_UP_EMAIL', 'LINKEDIN_MESSAGE', 'CALL_OPENER', 'VOICEMAIL', 'SMS_DRAFT', 'INTERNAL_SUMMARY');

-- CreateEnum
CREATE TYPE "AiDraftStatus" AS ENUM ('GENERATED', 'EDITED', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AiJobType" AS ENUM ('CLASSIFICATION', 'SCORING', 'RECOMMENDATIONS', 'OUTREACH', 'FULL_ANALYSIS');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "businessRecordId" TEXT NOT NULL,
    "leadProfileId" TEXT,
    "businessEnrichmentId" TEXT,
    "status" "AiAnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "industry" TEXT,
    "industryConfidence" INTEGER,
    "businessType" TEXT,
    "businessTypeConfidence" INTEGER,
    "segment" TEXT,
    "segmentConfidence" INTEGER,
    "leadScore" INTEGER,
    "leadScoreExplanation" TEXT,
    "priorityRecommendation" TEXT,
    "qualificationRecommendation" TEXT,
    "qualificationReason" TEXT,
    "recommendedServices" JSONB,
    "outreachAngles" JSONB,
    "evidence" JSONB NOT NULL,
    "warnings" JSONB,
    "rawStructuredOutput" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_outreach_drafts" (
    "id" TEXT NOT NULL,
    "businessRecordId" TEXT NOT NULL,
    "aiAnalysisId" TEXT NOT NULL,
    "leadProfileId" TEXT,
    "draftType" "AiDraftType" NOT NULL,
    "tone" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "originalBody" TEXT NOT NULL,
    "callToAction" TEXT,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiDraftStatus" NOT NULL DEFAULT 'GENERATED',
    "generatedByJobId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "editedById" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_outreach_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "jobType" "AiJobType" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" TEXT NOT NULL,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "queuedLeads" INTEGER NOT NULL DEFAULT 0,
    "processedLeads" INTEGER NOT NULL DEFAULT 0,
    "successfulLeads" INTEGER NOT NULL DEFAULT 0,
    "reviewLeads" INTEGER NOT NULL DEFAULT 0,
    "failedLeads" INTEGER NOT NULL DEFAULT 0,
    "skippedLeads" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCents" INTEGER,
    "actualCostCents" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "options" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_lead_jobs" (
    "id" TEXT NOT NULL,
    "aiJobId" TEXT NOT NULL,
    "businessRecordId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "inputFingerprint" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_lead_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "aiJobId" TEXT,
    "businessRecordId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "actualCostCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "classificationModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "outreachModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "dailyLeadLimit" INTEGER NOT NULL DEFAULT 500,
    "maxBatchSize" INTEGER NOT NULL DEFAULT 100,
    "retryLimit" INTEGER NOT NULL DEFAULT 3,
    "reviewConfidenceThreshold" INTEGER NOT NULL DEFAULT 60,
    "costCeilingCents" INTEGER NOT NULL DEFAULT 2500,
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "allowedTones" JSONB,
    "enabledDraftTypes" JSONB,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_analyses_businessRecordId_idx" ON "ai_analyses"("businessRecordId");

-- CreateIndex
CREATE INDEX "ai_analyses_status_idx" ON "ai_analyses"("status");

-- CreateIndex
CREATE INDEX "ai_analyses_industry_idx" ON "ai_analyses"("industry");

-- CreateIndex
CREATE INDEX "ai_analyses_segment_idx" ON "ai_analyses"("segment");

-- CreateIndex
CREATE INDEX "ai_analyses_leadScore_idx" ON "ai_analyses"("leadScore");

-- CreateIndex
CREATE INDEX "ai_analyses_priorityRecommendation_idx" ON "ai_analyses"("priorityRecommendation");

-- CreateIndex
CREATE INDEX "ai_analyses_qualificationRecommendation_idx" ON "ai_analyses"("qualificationRecommendation");

-- CreateIndex
CREATE INDEX "ai_analyses_promptVersion_idx" ON "ai_analyses"("promptVersion");

-- CreateIndex
CREATE INDEX "ai_analyses_model_idx" ON "ai_analyses"("model");

-- CreateIndex
CREATE INDEX "ai_analyses_inputFingerprint_idx" ON "ai_analyses"("inputFingerprint");

-- CreateIndex
CREATE INDEX "ai_analyses_createdAt_idx" ON "ai_analyses"("createdAt");

-- CreateIndex
CREATE INDEX "ai_analyses_approvedAt_idx" ON "ai_analyses"("approvedAt");

-- CreateIndex
CREATE INDEX "ai_outreach_drafts_businessRecordId_idx" ON "ai_outreach_drafts"("businessRecordId");

-- CreateIndex
CREATE INDEX "ai_outreach_drafts_aiAnalysisId_idx" ON "ai_outreach_drafts"("aiAnalysisId");

-- CreateIndex
CREATE INDEX "ai_outreach_drafts_draftType_idx" ON "ai_outreach_drafts"("draftType");

-- CreateIndex
CREATE INDEX "ai_outreach_drafts_status_idx" ON "ai_outreach_drafts"("status");

-- CreateIndex
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs"("status");

-- CreateIndex
CREATE INDEX "ai_jobs_jobType_idx" ON "ai_jobs"("jobType");

-- CreateIndex
CREATE INDEX "ai_jobs_requestedById_idx" ON "ai_jobs"("requestedById");

-- CreateIndex
CREATE INDEX "ai_jobs_createdAt_idx" ON "ai_jobs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_lead_jobs_status_idx" ON "ai_lead_jobs"("status");

-- CreateIndex
CREATE INDEX "ai_lead_jobs_businessRecordId_idx" ON "ai_lead_jobs"("businessRecordId");

-- CreateIndex
CREATE INDEX "ai_lead_jobs_aiJobId_idx" ON "ai_lead_jobs"("aiJobId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_lead_jobs_aiJobId_businessRecordId_key" ON "ai_lead_jobs"("aiJobId", "businessRecordId");

-- CreateIndex
CREATE INDEX "ai_usage_aiJobId_idx" ON "ai_usage"("aiJobId");

-- CreateIndex
CREATE INDEX "ai_usage_businessRecordId_idx" ON "ai_usage"("businessRecordId");

-- CreateIndex
CREATE INDEX "ai_usage_model_idx" ON "ai_usage"("model");

-- CreateIndex
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_businessRecordId_fkey" FOREIGN KEY ("businessRecordId") REFERENCES "business_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_outreach_drafts" ADD CONSTRAINT "ai_outreach_drafts_businessRecordId_fkey" FOREIGN KEY ("businessRecordId") REFERENCES "business_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_outreach_drafts" ADD CONSTRAINT "ai_outreach_drafts_aiAnalysisId_fkey" FOREIGN KEY ("aiAnalysisId") REFERENCES "ai_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_lead_jobs" ADD CONSTRAINT "ai_lead_jobs_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "ai_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_lead_jobs" ADD CONSTRAINT "ai_lead_jobs_businessRecordId_fkey" FOREIGN KEY ("businessRecordId") REFERENCES "business_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
