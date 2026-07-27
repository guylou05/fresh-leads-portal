import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_IMPORT_FILE_SIZE_BYTES,
} from "@/lib/imports/config";
import { fileExtension } from "@/lib/imports/storage";
import {
  cleanText,
  normalizeAddressLine,
  normalizeBusinessName,
  normalizeState,
  normalizeZip,
  parseEffectiveDate,
} from "@/lib/imports/normalization";
import { classifyEntityType } from "@/lib/imports/report-type";
import type {
  CanonicalField,
  NormalizedRecord,
  RowIssue,
} from "@/lib/imports/types";

export type FileValidationResult =
  | { ok: true; extension: string }
  | { ok: false; error: string };

/**
 * Validate upload metadata: extension allow-list, size bounds, and a soft MIME
 * check. The browser MIME type is never trusted alone (extension + the
 * binary-content sniff below are authoritative).
 */
export function validateFileMeta(input: {
  fileName: string;
  size: number;
  mimeType: string;
}): FileValidationResult {
  const extension = fileExtension(input.fileName);
  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    return {
      ok: false,
      error: "Unsupported file type. Please upload a .txt or .csv file.",
    };
  }
  if (input.size <= 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (input.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    const mb = Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024));
    return { ok: false, error: `The file exceeds the ${mb} MB limit.` };
  }
  const mime = (input.mimeType || "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (!ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      ok: false,
      error: "Unsupported content type. Please upload a plain .txt or .csv file.",
    };
  }
  return { ok: true, extension };
}

/**
 * Reject binary content (e.g. executables). CSV/TXT reports are UTF-8 text and
 * must not contain NUL bytes in the leading sample.
 */
export function looksBinary(sample: Buffer): boolean {
  const len = Math.min(sample.length, 8192);
  for (let i = 0; i < len; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

/** Read a column value by canonical field from a raw row. */
function getValue(
  values: string[],
  fieldIndex: Partial<Record<CanonicalField, number>>,
  field: CanonicalField,
): string | undefined {
  const idx = fieldIndex[field];
  if (idx == null) return undefined;
  return values[idx];
}

export type RowValidation = {
  record: NormalizedRecord | null;
  errors: RowIssue[];
  warnings: RowIssue[];
};

/**
 * Normalize and validate a single parsed row.
 * - Missing business name is a blocking error (row is INVALID, not persisted).
 * - An unparseable non-empty date is a non-blocking warning (date stored null).
 */
export function normalizeAndValidateRow(
  values: string[],
  fieldIndex: Partial<Record<CanonicalField, number>>,
  options: { malformed?: boolean } = {},
): RowValidation {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  if (options.malformed) {
    warnings.push({
      code: "MALFORMED_ROW",
      message: "Column count does not match the header row.",
    });
  }

  const rawBusinessName = getValue(values, fieldIndex, "businessName");
  const businessName = cleanText(rawBusinessName);
  if (!businessName) {
    errors.push({
      code: "BUSINESS_NAME_REQUIRED",
      message: "Business name is required.",
    });
  }

  const dateResult = parseEffectiveDate(
    getValue(values, fieldIndex, "effectiveDate"),
  );
  let effectiveDate: Date | null = null;
  if (dateResult.ok) {
    effectiveDate = dateResult.date;
  } else {
    warnings.push({ code: "INVALID_DATE", message: dateResult.reason });
  }

  if (errors.length > 0) {
    return { record: null, errors, warnings };
  }

  const transactionDescription = cleanText(
    getValue(values, fieldIndex, "transactionDescription"),
  );

  const record: NormalizedRecord = {
    documentNumber: cleanText(getValue(values, fieldIndex, "documentNumber")),
    charterNumber: cleanText(getValue(values, fieldIndex, "charterNumber")),
    effectiveDate,
    businessName: businessName as string,
    normalizedBusinessName: normalizeBusinessName(businessName as string),
    consentFlag: cleanText(getValue(values, fieldIndex, "consentFlag")),
    transactionDescription,
    entityType: classifyEntityType(transactionDescription),
    filingAddressName: cleanText(
      getValue(values, fieldIndex, "filingAddressName"),
    ),
    filingAddress1: normalizeAddressLine(
      getValue(values, fieldIndex, "filingAddress1"),
    ),
    filingAddress2: normalizeAddressLine(
      getValue(values, fieldIndex, "filingAddress2"),
    ),
    filingCity: cleanText(getValue(values, fieldIndex, "filingCity")),
    filingState: normalizeState(getValue(values, fieldIndex, "filingState")),
    filingZip: normalizeZip(getValue(values, fieldIndex, "filingZip")),
    agentName: cleanText(getValue(values, fieldIndex, "agentName")),
    agentAddress1: normalizeAddressLine(
      getValue(values, fieldIndex, "agentAddress1"),
    ),
    agentAddress2: normalizeAddressLine(
      getValue(values, fieldIndex, "agentAddress2"),
    ),
    agentCity: cleanText(getValue(values, fieldIndex, "agentCity")),
    agentState: normalizeState(getValue(values, fieldIndex, "agentState")),
    agentZip: normalizeZip(getValue(values, fieldIndex, "agentZip")),
    businessCity: cleanText(getValue(values, fieldIndex, "businessCity")),
    county: cleanText(getValue(values, fieldIndex, "county")),
    associateNamesRaw: cleanText(
      getValue(values, fieldIndex, "associateNamesRaw"),
    ),
  };

  if (!record.documentNumber && !record.charterNumber) {
    warnings.push({
      code: "MISSING_IDENTIFIERS",
      message: "No document or charter number; duplicate matching is weaker.",
    });
  }

  return { record, errors, warnings };
}

/** Build a { header -> value } object for a raw row (for error reports). */
export function buildRawRecord(
  header: string[],
  values: string[],
): Record<string, string> {
  const raw: Record<string, string> = {};
  header.forEach((key, i) => {
    raw[key || `column_${i + 1}`] = values[i] ?? "";
  });
  return raw;
}
