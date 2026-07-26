/** Canonical internal fields an Ohio business report can map to. */
export const CANONICAL_FIELDS = [
  "documentNumber",
  "charterNumber",
  "effectiveDate",
  "businessName",
  "consentFlag",
  "transactionDescription",
  "filingAddressName",
  "filingAddress1",
  "filingAddress2",
  "filingCity",
  "filingState",
  "filingZip",
  "agentName",
  "agentAddress1",
  "agentAddress2",
  "agentCity",
  "agentState",
  "agentZip",
  "businessCity",
  "county",
  "associateNamesRaw",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/** Detected mapping from an internal field to a source column. */
export type ColumnMapping = {
  field: CanonicalField;
  header: string;
  index: number;
};

/** Result of analyzing a file's header row. */
export type HeaderAnalysis = {
  headers: string[];
  mapping: ColumnMapping[];
  /** Canonical fields that were matched, for quick lookup. */
  mappedFields: CanonicalField[];
  unknownHeaders: string[];
  hasBusinessName: boolean;
};

/** A single normalized business record, prior to persistence. */
export type NormalizedRecord = {
  documentNumber: string | null;
  charterNumber: string | null;
  effectiveDate: Date | null;
  businessName: string;
  normalizedBusinessName: string;
  consentFlag: string | null;
  transactionDescription: string | null;
  entityType: string | null;
  filingAddressName: string | null;
  filingAddress1: string | null;
  filingAddress2: string | null;
  filingCity: string | null;
  filingState: string | null;
  filingZip: string | null;
  agentName: string | null;
  agentAddress1: string | null;
  agentAddress2: string | null;
  agentCity: string | null;
  agentState: string | null;
  agentZip: string | null;
  businessCity: string | null;
  county: string | null;
  associateNamesRaw: string | null;
};

export type DuplicateClass =
  | "NEW"
  | "EXACT_DUPLICATE"
  | "POSSIBLE_DUPLICATE"
  | "INVALID";

/** Outcome of validating + classifying a single parsed row. */
export type RowOutcome = {
  rowNumber: number;
  classification: DuplicateClass;
  record: NormalizedRecord | null;
  errors: RowIssue[];
  warnings: RowIssue[];
  raw: Record<string, string>;
};

export type RowIssue = {
  code: string;
  message: string;
};

/** Compact preview row surfaced to the confirmation UI. */
export type PreviewRow = {
  rowNumber: number;
  businessName: string;
  effectiveDate: string | null;
  businessCity: string | null;
  county: string | null;
  charterNumber: string | null;
  transactionDescription: string | null;
  classification: DuplicateClass;
  warnings: string[];
};

/** Aggregated counts produced by a full parse (preview or import). */
export type ImportCounts = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  newRows: number;
  exactDuplicates: number;
  possibleDuplicates: number;
};
