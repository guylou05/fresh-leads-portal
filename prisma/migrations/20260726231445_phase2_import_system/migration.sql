-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'READY', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storedFileName" TEXT,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reportType" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_records" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT,
    "charterNumber" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "businessName" TEXT NOT NULL,
    "normalizedBusinessName" TEXT NOT NULL,
    "consentFlag" TEXT,
    "transactionDescription" TEXT,
    "entityType" TEXT,
    "filingAddressName" TEXT,
    "filingAddress1" TEXT,
    "filingAddress2" TEXT,
    "filingCity" TEXT,
    "filingState" TEXT,
    "filingZip" TEXT,
    "agentName" TEXT,
    "agentAddress1" TEXT,
    "agentAddress2" TEXT,
    "agentCity" TEXT,
    "agentState" TEXT,
    "agentZip" TEXT,
    "businessCity" TEXT,
    "county" TEXT,
    "associateNamesRaw" TEXT,
    "source" TEXT NOT NULL,
    "sourceRecordHash" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row_errors" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB,
    "errorCode" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_row_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_status_idx" ON "import_batches"("status");

-- CreateIndex
CREATE INDEX "import_batches_uploadedById_idx" ON "import_batches"("uploadedById");

-- CreateIndex
CREATE INDEX "import_batches_source_idx" ON "import_batches"("source");

-- CreateIndex
CREATE INDEX "import_batches_createdAt_idx" ON "import_batches"("createdAt");

-- CreateIndex
CREATE INDEX "business_records_documentNumber_idx" ON "business_records"("documentNumber");

-- CreateIndex
CREATE INDEX "business_records_charterNumber_idx" ON "business_records"("charterNumber");

-- CreateIndex
CREATE INDEX "business_records_effectiveDate_idx" ON "business_records"("effectiveDate");

-- CreateIndex
CREATE INDEX "business_records_businessName_idx" ON "business_records"("businessName");

-- CreateIndex
CREATE INDEX "business_records_normalizedBusinessName_idx" ON "business_records"("normalizedBusinessName");

-- CreateIndex
CREATE INDEX "business_records_county_idx" ON "business_records"("county");

-- CreateIndex
CREATE INDEX "business_records_businessCity_idx" ON "business_records"("businessCity");

-- CreateIndex
CREATE INDEX "business_records_sourceRecordHash_idx" ON "business_records"("sourceRecordHash");

-- CreateIndex
CREATE INDEX "business_records_importBatchId_idx" ON "business_records"("importBatchId");

-- CreateIndex
CREATE INDEX "business_records_createdAt_idx" ON "business_records"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "business_records_source_sourceRecordHash_key" ON "business_records"("source", "sourceRecordHash");

-- CreateIndex
CREATE INDEX "import_row_errors_importBatchId_idx" ON "import_row_errors"("importBatchId");

-- CreateIndex
CREATE INDEX "import_row_errors_errorCode_idx" ON "import_row_errors"("errorCode");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_records" ADD CONSTRAINT "business_records_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_records" ADD CONSTRAINT "business_records_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
