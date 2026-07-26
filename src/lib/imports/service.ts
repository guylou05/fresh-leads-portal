import { Readable } from "node:stream";
import type { ImportBatch, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { IMPORT_INSERT_BATCH_SIZE, PREVIEW_ROW_LIMIT } from "@/lib/imports/config";
import { analyzeHeaders, buildFieldIndex } from "@/lib/imports/headers";
import { parseCsv, parseHeaderOnly } from "@/lib/imports/parser";
import {
  buildRawRecord,
  normalizeAndValidateRow,
} from "@/lib/imports/validation";
import {
  addToIndex,
  buildDedupeKeys,
  classifyDuplicate,
  createDedupeIndex,
  type DedupeIndex,
} from "@/lib/imports/deduplication";
import { detectReportType } from "@/lib/imports/report-type";
import { tempFileStream } from "@/lib/imports/storage";
import type {
  DuplicateClass,
  ImportCounts,
  NormalizedRecord,
  PreviewRow,
  RowOutcome,
} from "@/lib/imports/types";

export type FileAnalysis = {
  ok: true;
  headers: string[];
  mapping: { field: string; header: string; index: number }[];
  unknownHeaders: string[];
  reportType: string;
  reportTypeConfidence: "high" | "medium" | "low";
  counts: ImportCounts;
  previewRows: PreviewRow[];
  outcomes: RowOutcome[];
};

export type FileAnalysisError = { ok: false; error: string };

const CHUNK = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Load an index of existing DB records that could match this batch's rows. */
async function loadExistingIndex(
  source: string,
  candidates: {
    documentNumbers: Set<string>;
    charterNumbers: Set<string>;
    hashes: Set<string>;
    names: Set<string>;
  },
): Promise<DedupeIndex> {
  const index = createDedupeIndex();

  const orFilters: Prisma.BusinessRecordWhereInput[] = [];
  for (const docs of chunk([...candidates.documentNumbers], CHUNK)) {
    if (docs.length) orFilters.push({ documentNumber: { in: docs } });
  }
  for (const charters of chunk([...candidates.charterNumbers], CHUNK)) {
    if (charters.length) orFilters.push({ charterNumber: { in: charters } });
  }
  for (const hashes of chunk([...candidates.hashes], CHUNK)) {
    if (hashes.length) orFilters.push({ sourceRecordHash: { in: hashes } });
  }
  for (const names of chunk([...candidates.names], CHUNK)) {
    if (names.length) orFilters.push({ normalizedBusinessName: { in: names } });
  }
  if (orFilters.length === 0) return index;

  const existing = await prisma.businessRecord.findMany({
    where: { source, OR: orFilters },
    select: {
      documentNumber: true,
      charterNumber: true,
      effectiveDate: true,
      normalizedBusinessName: true,
      businessCity: true,
      sourceRecordHash: true,
      businessName: true,
    },
  });

  for (const rec of existing) {
    const normalized: NormalizedRecord = {
      ...emptyRecord(),
      businessName: rec.businessName,
      normalizedBusinessName: rec.normalizedBusinessName,
      documentNumber: rec.documentNumber,
      charterNumber: rec.charterNumber,
      effectiveDate: rec.effectiveDate,
      businessCity: rec.businessCity,
    };
    const keys = buildDedupeKeys(source, normalized);
    // Trust the stored hash for exactness.
    keys.hash = rec.sourceRecordHash;
    addToIndex(index, keys);
  }

  return index;
}

function emptyRecord(): NormalizedRecord {
  return {
    documentNumber: null,
    charterNumber: null,
    effectiveDate: null,
    businessName: "",
    normalizedBusinessName: "",
    consentFlag: null,
    transactionDescription: null,
    entityType: null,
    filingAddressName: null,
    filingAddress1: null,
    filingAddress2: null,
    filingCity: null,
    filingState: null,
    filingZip: null,
    agentName: null,
    agentAddress1: null,
    agentAddress2: null,
    agentCity: null,
    agentState: null,
    agentZip: null,
    businessCity: null,
    county: null,
    associateNamesRaw: null,
  };
}

/**
 * Parse + validate + classify a whole file. Reads the stream twice (header, then
 * rows) so it works from a buffer or a temp file without holding the raw file.
 */
export async function analyzeFile(input: {
  createStream: () => Readable;
  source: string;
  fileName: string;
}): Promise<FileAnalysis | FileAnalysisError> {
  const header = await parseHeaderOnly(input.createStream());
  const analysis = analyzeHeaders(header);
  if (!analysis.hasBusinessName) {
    return {
      ok: false,
      error:
        "Could not find a required 'Business Name' column. Please check the file headers.",
    };
  }
  const fieldIndex = buildFieldIndex(analysis);

  const outcomes: RowOutcome[] = [];
  const documentNumbers = new Set<string>();
  const charterNumbers = new Set<string>();
  const hashes = new Set<string>();
  const names = new Set<string>();
  const transactionSamples: string[] = [];

  await parseCsv(input.createStream(), (row, hdr) => {
    const raw = buildRawRecord(hdr, row.values);
    const { record, errors, warnings } = normalizeAndValidateRow(
      row.values,
      fieldIndex,
      { malformed: row.malformed },
    );

    if (record) {
      if (record.documentNumber) documentNumbers.add(record.documentNumber);
      if (record.charterNumber) charterNumbers.add(record.charterNumber);
      names.add(record.normalizedBusinessName);
      hashes.add(buildDedupeKeys(input.source, record).hash);
      if (record.transactionDescription && transactionSamples.length < 100) {
        transactionSamples.push(record.transactionDescription);
      }
    }

    outcomes.push({
      rowNumber: row.rowNumber,
      classification: record ? "NEW" : "INVALID",
      record,
      errors,
      warnings,
      raw,
    });
  });

  const existing = await loadExistingIndex(input.source, {
    documentNumbers,
    charterNumbers,
    hashes,
    names,
  });
  const seen = createDedupeIndex();

  let invalidRows = 0;
  let exactDuplicates = 0;
  let possibleDuplicates = 0;
  let newRows = 0;
  const previewRows: PreviewRow[] = [];

  for (const outcome of outcomes) {
    if (!outcome.record) {
      invalidRows += 1;
      continue;
    }
    const keys = buildDedupeKeys(input.source, outcome.record);
    const classification: DuplicateClass = classifyDuplicate(
      keys,
      existing,
      seen,
    );
    outcome.classification = classification;
    addToIndex(seen, keys);

    if (classification === "EXACT_DUPLICATE") exactDuplicates += 1;
    else if (classification === "POSSIBLE_DUPLICATE") possibleDuplicates += 1;
    else newRows += 1;

    if (previewRows.length < PREVIEW_ROW_LIMIT) {
      previewRows.push(toPreviewRow(outcome));
    }
  }

  const reportType = detectReportType({
    fileName: input.fileName,
    transactionSamples,
  });

  const counts: ImportCounts = {
    totalRows: outcomes.length,
    validRows: outcomes.length - invalidRows,
    invalidRows,
    newRows,
    exactDuplicates,
    possibleDuplicates,
  };

  return {
    ok: true,
    headers: analysis.headers,
    mapping: analysis.mapping.map((m) => ({
      field: m.field,
      header: m.header,
      index: m.index,
    })),
    unknownHeaders: analysis.unknownHeaders,
    reportType: reportType.reportType,
    reportTypeConfidence: reportType.confidence,
    counts,
    previewRows,
    outcomes,
  };
}

function toPreviewRow(outcome: RowOutcome): PreviewRow {
  const r = outcome.record;
  return {
    rowNumber: outcome.rowNumber,
    businessName: r?.businessName ?? "",
    effectiveDate: r?.effectiveDate ? r.effectiveDate.toISOString().slice(0, 10) : null,
    businessCity: r?.businessCity ?? null,
    county: r?.county ?? null,
    charterNumber: r?.charterNumber ?? null,
    transactionDescription: r?.transactionDescription ?? null,
    classification: outcome.classification,
    warnings: outcome.warnings.map((w) => w.message),
  };
}

export type ImportSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  exactDuplicates: number;
  possibleDuplicates: number;
  possibleDuplicatesSkipped: number;
  skippedRows: number;
  duplicateRows: number;
};

/** Compute the final import summary from analysis + insertion results. */
export function buildImportSummary(
  counts: ImportCounts,
  opts: { includePossible: boolean; imported: number; attempted: number },
): ImportSummary {
  const uniqueSkipped = Math.max(0, opts.attempted - opts.imported);
  const possibleDuplicatesSkipped = opts.includePossible
    ? 0
    : counts.possibleDuplicates;
  return {
    totalRows: counts.totalRows,
    validRows: counts.validRows,
    invalidRows: counts.invalidRows,
    importedRows: opts.imported,
    exactDuplicates: counts.exactDuplicates,
    possibleDuplicates: counts.possibleDuplicates,
    possibleDuplicatesSkipped,
    skippedRows:
      counts.exactDuplicates + possibleDuplicatesSkipped + uniqueSkipped,
    duplicateRows: counts.exactDuplicates + counts.possibleDuplicates,
  };
}

/**
 * Execute a prepared import. Reads rows from the batch's temp file, inserts NEW
 * (and optionally POSSIBLE) records in batches, records invalid rows, and
 * finalizes batch status. Row-level errors never abort the run; a database
 * failure fails the batch safely.
 */
export async function executeImport(
  batch: ImportBatch,
  options: { includePossible: boolean; importedById: string },
): Promise<ImportSummary> {
  if (!batch.storedFileName) {
    throw new Error("Uploaded file is no longer available.");
  }
  const storedFileName = batch.storedFileName;

  const analysis = await analyzeFile({
    createStream: () => tempFileStream(storedFileName),
    source: batch.source,
    fileName: batch.originalFileName,
  });
  if (!analysis.ok) {
    throw new Error(analysis.error);
  }

  const toInsert: Prisma.BusinessRecordCreateManyInput[] = [];
  const rowErrors: Prisma.ImportRowErrorCreateManyInput[] = [];

  for (const outcome of analysis.outcomes) {
    if (!outcome.record) {
      const firstError = outcome.errors[0];
      rowErrors.push({
        importBatchId: batch.id,
        rowNumber: outcome.rowNumber,
        rawData: outcome.raw as Prisma.InputJsonValue,
        errorCode: firstError?.code ?? "INVALID_ROW",
        errorMessage: firstError?.message ?? "Invalid row",
      });
      continue;
    }
    const include =
      outcome.classification === "NEW" ||
      (outcome.classification === "POSSIBLE_DUPLICATE" && options.includePossible);
    if (!include) continue;

    const keys = buildDedupeKeys(batch.source, outcome.record);
    toInsert.push({
      ...outcome.record,
      source: batch.source,
      sourceRecordHash: keys.hash,
      importBatchId: batch.id,
      importedById: options.importedById,
    });
  }

  let imported = 0;
  for (const group of chunk(toInsert, IMPORT_INSERT_BATCH_SIZE)) {
    const result = await prisma.businessRecord.createMany({
      data: group,
      skipDuplicates: true,
    });
    imported += result.count;
  }

  if (rowErrors.length > 0) {
    for (const group of chunk(rowErrors, IMPORT_INSERT_BATCH_SIZE)) {
      await prisma.importRowError.createMany({ data: group });
    }
  }

  const summary = buildImportSummary(analysis.counts, {
    includePossible: options.includePossible,
    imported,
    attempted: toInsert.length,
  });

  const existingMeta =
    (batch.metadata as Record<string, unknown> | null) ?? {};

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status:
        summary.invalidRows > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      totalRows: summary.totalRows,
      validRows: summary.validRows,
      invalidRows: summary.invalidRows,
      duplicateRows: summary.duplicateRows,
      importedRows: summary.importedRows,
      skippedRows: summary.skippedRows,
      completedAt: new Date(),
      metadata: {
        ...existingMeta,
        summary: { ...summary },
      } as Prisma.InputJsonValue,
    },
  });

  return summary;
}
