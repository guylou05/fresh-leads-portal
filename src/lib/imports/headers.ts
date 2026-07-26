import {
  type CanonicalField,
  type ColumnMapping,
  type HeaderAnalysis,
} from "@/lib/imports/types";

/**
 * Canonical header key: uppercased and stripped of all non-alphanumeric
 * characters, so "BUSINESS NAME", "Business Name", "business_name", and
 * "BUSINESSNAME" all collapse to the same key.
 */
export function canonicalizeHeaderKey(header: string): string {
  return header.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Map of canonical header key -> internal field. */
const HEADER_ALIASES: Record<string, CanonicalField> = {
  DOCUMENTNUMBER: "documentNumber",
  DOCNUMBER: "documentNumber",
  DOCUMENTNO: "documentNumber",
  CHARTERNUMBER: "charterNumber",
  CHARTERNO: "charterNumber",
  EFFECTIVEDATE: "effectiveDate",
  BUSINESSNAME: "businessName",
  CONSENTFLAG: "consentFlag",
  TRANSACTIONCODEDESCRIPTION: "transactionDescription",
  TRANSACTIONDESCRIPTION: "transactionDescription",
  TRANSACTIONCODEDESC: "transactionDescription",
  FILINGADDRESSNAME: "filingAddressName",
  FILINGADDRESS1: "filingAddress1",
  FILINGADDRESS2: "filingAddress2",
  FILINGCITY: "filingCity",
  FILINGSTATE: "filingState",
  FILINGZIP: "filingZip",
  AGENTADDRESSNAME: "agentName",
  AGENTNAME: "agentName",
  AGENTADDRESS1: "agentAddress1",
  AGENTADDRESS2: "agentAddress2",
  AGENTCITY: "agentCity",
  AGENTSTATE: "agentState",
  AGENTZIP: "agentZip",
  BUSINESSCITY: "businessCity",
  COUNTY: "county",
  BUSINESSASSOCIATENAMES: "associateNamesRaw",
  ASSOCIATENAMES: "associateNamesRaw",
};

/**
 * Analyze a header row: map known columns to canonical fields (first occurrence
 * wins for duplicate headers), collect unknown headers, and flag Business Name.
 */
export function analyzeHeaders(rawHeaders: string[]): HeaderAnalysis {
  const headers = rawHeaders.map((h) => h.trim());
  const mapping: ColumnMapping[] = [];
  const seenFields = new Set<CanonicalField>();
  const unknownHeaders: string[] = [];

  headers.forEach((header, index) => {
    const key = canonicalizeHeaderKey(header);
    const field = HEADER_ALIASES[key];
    if (field && !seenFields.has(field)) {
      seenFields.add(field);
      mapping.push({ field, header, index });
    } else if (!field && header.length > 0) {
      unknownHeaders.push(header);
    }
    // Duplicate mapped headers are safely ignored (first occurrence wins).
  });

  return {
    headers,
    mapping,
    mappedFields: [...seenFields],
    unknownHeaders,
    hasBusinessName: seenFields.has("businessName"),
  };
}

/** Build a { field -> column index } lookup from a header analysis. */
export function buildFieldIndex(
  analysis: HeaderAnalysis,
): Partial<Record<CanonicalField, number>> {
  const index: Partial<Record<CanonicalField, number>> = {};
  for (const m of analysis.mapping) {
    index[m.field] = m.index;
  }
  return index;
}
