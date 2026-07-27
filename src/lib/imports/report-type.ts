/** Known Ohio report / entity type labels. */
export const REPORT_TYPES = [
  "Domestic LLC",
  "Domestic For-Profit Corporation",
  "Domestic Nonprofit Corporation",
  "Foreign LLC",
  "Foreign Corporation",
  "Unknown",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportTypeDetection = {
  reportType: ReportType;
  confidence: "high" | "medium" | "low";
};

/**
 * Classify a single transaction-description value into an entity/report type.
 * Returns null when it cannot be confidently classified.
 */
export function classifyEntityType(
  description: string | null | undefined,
): ReportType | null {
  if (!description) return null;
  const text = description.toUpperCase();
  const foreign = /\bFOREIGN\b/.test(text);

  if (/LIMITED LIABILITY|\bLLC\b/.test(text)) {
    return foreign ? "Foreign LLC" : "Domestic LLC";
  }
  if (/NON[\s-]?PROFIT/.test(text)) {
    return "Domestic Nonprofit Corporation";
  }
  if (/FOR[\s-]?PROFIT/.test(text)) {
    return "Domestic For-Profit Corporation";
  }
  if (/CORP|CORPORATION|INCORPORAT/.test(text)) {
    return foreign ? "Foreign Corporation" : "Domestic For-Profit Corporation";
  }
  return null;
}

/**
 * Infer the report type for a batch from the file name plus a sample of
 * transaction descriptions. Falls back to "Unknown" at low confidence.
 */
export function detectReportType(input: {
  fileName: string;
  transactionSamples: string[];
}): ReportTypeDetection {
  // 1) Transaction descriptions are the strongest signal.
  const tally = new Map<ReportType, number>();
  for (const sample of input.transactionSamples) {
    const type = classifyEntityType(sample);
    if (type) tally.set(type, (tally.get(type) ?? 0) + 1);
  }
  let best: ReportType | null = null;
  let bestCount = 0;
  for (const [type, count] of tally) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  const sampled = input.transactionSamples.length;
  if (best && sampled > 0 && bestCount / sampled >= 0.6) {
    return { reportType: best, confidence: "high" };
  }

  // 2) Fall back to the file name.
  const name = input.fileName.toUpperCase();
  const foreign = /FOREIGN/.test(name);
  if (/LLC|LIMITED[_\s-]?LIABILITY/.test(name)) {
    return {
      reportType: foreign ? "Foreign LLC" : "Domestic LLC",
      confidence: "medium",
    };
  }
  if (/NON[_\s-]?PROFIT/.test(name)) {
    return { reportType: "Domestic Nonprofit Corporation", confidence: "medium" };
  }
  if (/FOR[_\s-]?PROFIT|CORP/.test(name)) {
    return {
      reportType: foreign
        ? "Foreign Corporation"
        : "Domestic For-Profit Corporation",
      confidence: "medium",
    };
  }

  // 3) A weak plurality from transactions, if any.
  if (best) return { reportType: best, confidence: "low" };
  return { reportType: "Unknown", confidence: "low" };
}
