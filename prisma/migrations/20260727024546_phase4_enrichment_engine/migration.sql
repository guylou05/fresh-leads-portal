-- CreateEnum
CREATE TYPE "EnrichmentJobStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnrichmentScope" AS ENUM ('SELECTED_LEADS', 'FILTERED_RESULTS', 'IMPORT_BATCH', 'SINGLE_LEAD');

-- CreateEnum
CREATE TYPE "EnrichmentLeadStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED', 'CANCELLED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "BusinessEnrichmentStatus" AS ENUM ('NOT_ENRICHED', 'QUEUED', 'PROCESSING', 'PARTIAL', 'ENRICHED', 'NEEDS_REVIEW', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "WebsiteCrawlStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'BLOCKED', 'TIMEOUT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "enrichment_jobs" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "EnrichmentJobStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" "EnrichmentScope" NOT NULL,
    "providerStrategy" TEXT NOT NULL,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "queuedLeads" INTEGER NOT NULL DEFAULT 0,
    "processedLeads" INTEGER NOT NULL DEFAULT 0,
    "successfulLeads" INTEGER NOT NULL DEFAULT 0,
    "partialLeads" INTEGER NOT NULL DEFAULT 0,
    "failedLeads" INTEGER NOT NULL DEFAULT 0,
    "skippedLeads" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCents" INTEGER,
    "actualCostCents" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "options" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrichment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_lead_jobs" (
    "id" TEXT NOT NULL,
    "enrichmentJobId" TEXT NOT NULL,
    "businessRecordId" TEXT NOT NULL,
    "leadProfileId" TEXT,
    "status" "EnrichmentLeadStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerResults" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrichment_lead_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_enrichments" (
    "id" TEXT NOT NULL,
    "businessRecordId" TEXT NOT NULL,
    "website" TEXT,
    "websiteSource" TEXT,
    "websiteConfidence" INTEGER,
    "websiteVerifiedAt" TIMESTAMP(3),
    "phone" TEXT,
    "normalizedPhone" TEXT,
    "phoneSource" TEXT,
    "phoneConfidence" INTEGER,
    "phoneVerifiedAt" TIMESTAMP(3),
    "publicEmail" TEXT,
    "emailSource" TEXT,
    "emailConfidence" INTEGER,
    "emailVerifiedAt" TIMESTAMP(3),
    "contactPageUrl" TEXT,
    "googlePlaceId" TEXT,
    "googleMapsUrl" TEXT,
    "googleBusinessName" TEXT,
    "googlePrimaryCategory" TEXT,
    "googleSecondaryCategories" JSONB,
    "googleBusinessStatus" TEXT,
    "googleRating" DOUBLE PRECISION,
    "googleReviewCount" INTEGER,
    "googleAddress" TEXT,
    "googleCity" TEXT,
    "googleState" TEXT,
    "googleZip" TEXT,
    "googleLatitude" DOUBLE PRECISION,
    "googleLongitude" DOUBLE PRECISION,
    "facebookUrl" TEXT,
    "linkedinUrl" TEXT,
    "instagramUrl" TEXT,
    "xUrl" TEXT,
    "youtubeUrl" TEXT,
    "businessCategory" TEXT,
    "enrichmentStatus" "BusinessEnrichmentStatus" NOT NULL DEFAULT 'NOT_ENRICHED',
    "overallConfidence" INTEGER,
    "lastEnrichedAt" TIMESTAMP(3),
    "lastSuccessfulEnrichmentAt" TIMESTAMP(3),
    "manualReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_source_records" (
    "id" TEXT NOT NULL,
    "businessRecordId" TEXT NOT NULL,
    "enrichmentJobId" TEXT,
    "provider" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "fieldName" TEXT NOT NULL,
    "rawValue" TEXT,
    "normalizedValue" TEXT,
    "confidence" INTEGER NOT NULL,
    "matchReason" TEXT,
    "metadata" JSONB,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrichment_source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_crawl_results" (
    "id" TEXT NOT NULL,
    "businessRecordId" TEXT NOT NULL,
    "enrichmentJobId" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "statusCode" INTEGER,
    "contentHash" TEXT,
    "title" TEXT,
    "extractedEmails" JSONB,
    "extractedPhones" JSONB,
    "extractedSocialLinks" JSONB,
    "extractedBusinessName" TEXT,
    "extractedAddress" TEXT,
    "crawlStatus" "WebsiteCrawlStatus" NOT NULL,
    "errorCode" TEXT,
    "crawledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_crawl_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_usage" (
    "id" TEXT NOT NULL,
    "enrichmentJobId" TEXT,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "actualCostCents" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrichment_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "dailyLeadLimit" INTEGER NOT NULL DEFAULT 500,
    "maxLeadsPerJob" INTEGER NOT NULL DEFAULT 200,
    "cacheDays" INTEGER NOT NULL DEFAULT 30,
    "retryLimit" INTEGER NOT NULL DEFAULT 3,
    "reviewConfidenceThreshold" INTEGER NOT NULL DEFAULT 60,
    "websiteCrawlEnabled" BOOLEAN NOT NULL DEFAULT true,
    "websitePageLimit" INTEGER NOT NULL DEFAULT 5,
    "requestTimeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "costCeilingCents" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrichment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enrichment_jobs_status_idx" ON "enrichment_jobs"("status");

-- CreateIndex
CREATE INDEX "enrichment_jobs_requestedById_idx" ON "enrichment_jobs"("requestedById");

-- CreateIndex
CREATE INDEX "enrichment_jobs_createdAt_idx" ON "enrichment_jobs"("createdAt");

-- CreateIndex
CREATE INDEX "enrichment_lead_jobs_status_idx" ON "enrichment_lead_jobs"("status");

-- CreateIndex
CREATE INDEX "enrichment_lead_jobs_businessRecordId_idx" ON "enrichment_lead_jobs"("businessRecordId");

-- CreateIndex
CREATE INDEX "enrichment_lead_jobs_enrichmentJobId_idx" ON "enrichment_lead_jobs"("enrichmentJobId");

-- CreateIndex
CREATE INDEX "enrichment_lead_jobs_nextRetryAt_idx" ON "enrichment_lead_jobs"("nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "enrichment_lead_jobs_enrichmentJobId_businessRecordId_key" ON "enrichment_lead_jobs"("enrichmentJobId", "businessRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "business_enrichments_businessRecordId_key" ON "business_enrichments"("businessRecordId");

-- CreateIndex
CREATE INDEX "business_enrichments_enrichmentStatus_idx" ON "business_enrichments"("enrichmentStatus");

-- CreateIndex
CREATE INDEX "business_enrichments_website_idx" ON "business_enrichments"("website");

-- CreateIndex
CREATE INDEX "business_enrichments_normalizedPhone_idx" ON "business_enrichments"("normalizedPhone");

-- CreateIndex
CREATE INDEX "business_enrichments_publicEmail_idx" ON "business_enrichments"("publicEmail");

-- CreateIndex
CREATE INDEX "business_enrichments_googlePlaceId_idx" ON "business_enrichments"("googlePlaceId");

-- CreateIndex
CREATE INDEX "business_enrichments_lastEnrichedAt_idx" ON "business_enrichments"("lastEnrichedAt");

-- CreateIndex
CREATE INDEX "business_enrichments_manualReviewRequired_idx" ON "business_enrichments"("manualReviewRequired");

-- CreateIndex
CREATE INDEX "enrichment_source_records_businessRecordId_idx" ON "enrichment_source_records"("businessRecordId");

-- CreateIndex
CREATE INDEX "enrichment_source_records_enrichmentJobId_idx" ON "enrichment_source_records"("enrichmentJobId");

-- CreateIndex
CREATE INDEX "enrichment_source_records_provider_idx" ON "enrichment_source_records"("provider");

-- CreateIndex
CREATE INDEX "enrichment_source_records_fieldName_idx" ON "enrichment_source_records"("fieldName");

-- CreateIndex
CREATE INDEX "enrichment_source_records_retrievedAt_idx" ON "enrichment_source_records"("retrievedAt");

-- CreateIndex
CREATE INDEX "website_crawl_results_businessRecordId_idx" ON "website_crawl_results"("businessRecordId");

-- CreateIndex
CREATE INDEX "website_crawl_results_enrichmentJobId_idx" ON "website_crawl_results"("enrichmentJobId");

-- CreateIndex
CREATE INDEX "website_crawl_results_crawlStatus_idx" ON "website_crawl_results"("crawlStatus");

-- CreateIndex
CREATE INDEX "website_crawl_results_crawledAt_idx" ON "website_crawl_results"("crawledAt");

-- CreateIndex
CREATE INDEX "enrichment_usage_enrichmentJobId_idx" ON "enrichment_usage"("enrichmentJobId");

-- CreateIndex
CREATE INDEX "enrichment_usage_provider_idx" ON "enrichment_usage"("provider");

-- CreateIndex
CREATE INDEX "enrichment_usage_createdAt_idx" ON "enrichment_usage"("createdAt");

-- AddForeignKey
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_lead_jobs" ADD CONSTRAINT "enrichment_lead_jobs_enrichmentJobId_fkey" FOREIGN KEY ("enrichmentJobId") REFERENCES "enrichment_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_lead_jobs" ADD CONSTRAINT "enrichment_lead_jobs_businessRecordId_fkey" FOREIGN KEY ("businessRecordId") REFERENCES "business_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_enrichments" ADD CONSTRAINT "business_enrichments_businessRecordId_fkey" FOREIGN KEY ("businessRecordId") REFERENCES "business_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_source_records" ADD CONSTRAINT "enrichment_source_records_businessRecordId_fkey" FOREIGN KEY ("businessRecordId") REFERENCES "business_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_crawl_results" ADD CONSTRAINT "website_crawl_results_businessRecordId_fkey" FOREIGN KEY ("businessRecordId") REFERENCES "business_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
