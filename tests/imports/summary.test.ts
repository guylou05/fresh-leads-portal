import { describe, expect, it } from "vitest";
import { buildImportSummary } from "@/lib/imports/service";
import type { ImportCounts } from "@/lib/imports/types";

const counts: ImportCounts = {
  totalRows: 4283,
  validRows: 4210,
  invalidRows: 73,
  newRows: 4090,
  exactDuplicates: 102,
  possibleDuplicates: 18,
};

describe("import summary calculations", () => {
  it("skips exact + possible duplicates by default", () => {
    const summary = buildImportSummary(counts, {
      includePossible: false,
      imported: 4090,
      attempted: 4090,
    });
    expect(summary.importedRows).toBe(4090);
    expect(summary.exactDuplicates).toBe(102);
    expect(summary.possibleDuplicatesSkipped).toBe(18);
    expect(summary.duplicateRows).toBe(120);
    expect(summary.skippedRows).toBe(120);
    expect(summary.invalidRows).toBe(73);
  });

  it("imports possible duplicates when requested", () => {
    const summary = buildImportSummary(counts, {
      includePossible: true,
      imported: 4108,
      attempted: 4108,
    });
    expect(summary.importedRows).toBe(4108);
    expect(summary.possibleDuplicatesSkipped).toBe(0);
    expect(summary.skippedRows).toBe(102);
  });

  it("counts unique-constraint skips (concurrent-safe) as skipped", () => {
    const summary = buildImportSummary(counts, {
      includePossible: false,
      imported: 4088,
      attempted: 4090,
    });
    // 2 rows lost a race and were skipped by the DB unique constraint.
    expect(summary.importedRows).toBe(4088);
    expect(summary.skippedRows).toBe(122);
  });
});
