-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'REVIEWING', 'QUALIFIED', 'CONTACT_READY', 'CONTACTED', 'FOLLOW_UP', 'INTERESTED', 'PROPOSAL', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('PROFILE_CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'NOTE_ADDED', 'NOTE_UPDATED', 'NOTE_DELETED', 'TAG_ADDED', 'TAG_REMOVED', 'FOLLOW_UP_SET', 'FOLLOW_UP_CLEARED', 'CONTACT_UPDATED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED', 'RESTORED', 'BULK_UPDATED');

-- CreateEnum
CREATE TYPE "SegmentVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateTable
CREATE TABLE "lead_profiles" (
    "id" TEXT NOT NULL,
    "businessRecordId" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "priority" "LeadPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedToId" TEXT,
    "primaryContactName" TEXT,
    "primaryContactTitle" TEXT,
    "primaryEmail" TEXT,
    "primaryPhone" TEXT,
    "primaryPhoneNormalized" TEXT,
    "website" TEXT,
    "customIndustry" TEXT,
    "followUpAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "qualifiedAt" TIMESTAMP(3),
    "disqualifiedAt" TIMESTAMP(3),
    "disqualificationReason" TEXT,
    "estimatedValueCents" INTEGER,
    "internalSummary" TEXT,
    "archivedAt" TIMESTAMP(3),
    "preArchiveStatus" "LeadStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "lead_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_tags" (
    "id" TEXT NOT NULL,
    "leadProfileId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" TEXT NOT NULL,
    "leadProfileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "leadProfileId" TEXT NOT NULL,
    "actorId" TEXT,
    "activityType" "LeadActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_segments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "visibility" "SegmentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "saved_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_profiles_businessRecordId_key" ON "lead_profiles"("businessRecordId");

-- CreateIndex
CREATE INDEX "lead_profiles_status_idx" ON "lead_profiles"("status");

-- CreateIndex
CREATE INDEX "lead_profiles_priority_idx" ON "lead_profiles"("priority");

-- CreateIndex
CREATE INDEX "lead_profiles_assignedToId_idx" ON "lead_profiles"("assignedToId");

-- CreateIndex
CREATE INDEX "lead_profiles_followUpAt_idx" ON "lead_profiles"("followUpAt");

-- CreateIndex
CREATE INDEX "lead_profiles_lastContactedAt_idx" ON "lead_profiles"("lastContactedAt");

-- CreateIndex
CREATE INDEX "lead_profiles_createdAt_idx" ON "lead_profiles"("createdAt");

-- CreateIndex
CREATE INDEX "lead_profiles_updatedAt_idx" ON "lead_profiles"("updatedAt");

-- CreateIndex
CREATE INDEX "lead_profiles_primaryEmail_idx" ON "lead_profiles"("primaryEmail");

-- CreateIndex
CREATE INDEX "lead_profiles_primaryPhone_idx" ON "lead_profiles"("primaryPhone");

-- CreateIndex
CREATE INDEX "lead_profiles_website_idx" ON "lead_profiles"("website");

-- CreateIndex
CREATE UNIQUE INDEX "tags_normalizedName_key" ON "tags"("normalizedName");

-- CreateIndex
CREATE INDEX "tags_createdById_idx" ON "tags"("createdById");

-- CreateIndex
CREATE INDEX "lead_tags_tagId_idx" ON "lead_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "lead_tags_leadProfileId_tagId_key" ON "lead_tags"("leadProfileId", "tagId");

-- CreateIndex
CREATE INDEX "lead_notes_leadProfileId_idx" ON "lead_notes"("leadProfileId");

-- CreateIndex
CREATE INDEX "lead_notes_authorId_idx" ON "lead_notes"("authorId");

-- CreateIndex
CREATE INDEX "lead_notes_isPinned_idx" ON "lead_notes"("isPinned");

-- CreateIndex
CREATE INDEX "lead_activities_leadProfileId_idx" ON "lead_activities"("leadProfileId");

-- CreateIndex
CREATE INDEX "lead_activities_activityType_idx" ON "lead_activities"("activityType");

-- CreateIndex
CREATE INDEX "lead_activities_createdAt_idx" ON "lead_activities"("createdAt");

-- CreateIndex
CREATE INDEX "saved_segments_ownerId_idx" ON "saved_segments"("ownerId");

-- CreateIndex
CREATE INDEX "saved_segments_visibility_idx" ON "saved_segments"("visibility");

-- AddForeignKey
ALTER TABLE "lead_profiles" ADD CONSTRAINT "lead_profiles_businessRecordId_fkey" FOREIGN KEY ("businessRecordId") REFERENCES "business_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_profiles" ADD CONSTRAINT "lead_profiles_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_profiles" ADD CONSTRAINT "lead_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_profiles" ADD CONSTRAINT "lead_profiles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_leadProfileId_fkey" FOREIGN KEY ("leadProfileId") REFERENCES "lead_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_leadProfileId_fkey" FOREIGN KEY ("leadProfileId") REFERENCES "lead_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadProfileId_fkey" FOREIGN KEY ("leadProfileId") REFERENCES "lead_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_segments" ADD CONSTRAINT "saved_segments_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
