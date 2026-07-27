import { describe, expect, it } from "vitest";
import {
  looksBinary,
  normalizeAndValidateRow,
  validateFileMeta,
} from "@/lib/imports/validation";
import { MAX_IMPORT_FILE_SIZE_BYTES } from "@/lib/imports/config";
import { analyzeHeaders, buildFieldIndex } from "@/lib/imports/headers";

describe("file metadata validation", () => {
  it("accepts a .txt file", () => {
    expect(
      validateFileMeta({ fileName: "report.txt", size: 100, mimeType: "text/plain" }).ok,
    ).toBe(true);
  });

  it("accepts a .csv file", () => {
    expect(
      validateFileMeta({ fileName: "report.csv", size: 100, mimeType: "text/csv" }).ok,
    ).toBe(true);
  });

  it("rejects an invalid extension", () => {
    const result = validateFileMeta({
      fileName: "malware.exe",
      size: 100,
      mimeType: "application/octet-stream",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(
      validateFileMeta({ fileName: "report.csv", size: 0, mimeType: "text/csv" }).ok,
    ).toBe(false);
  });

  it("rejects an oversized file", () => {
    const result = validateFileMeta({
      fileName: "report.csv",
      size: MAX_IMPORT_FILE_SIZE_BYTES + 1,
      mimeType: "text/csv",
    });
    expect(result.ok).toBe(false);
  });
});

describe("binary sniffing", () => {
  it("detects NUL bytes as binary", () => {
    expect(looksBinary(Buffer.from([0x41, 0x00, 0x42]))).toBe(true);
  });
  it("treats plain text as non-binary", () => {
    expect(looksBinary(Buffer.from("BUSINESS NAME,COUNTY", "utf8"))).toBe(false);
  });
});

describe("row normalization + validation", () => {
  const header = ["BUSINESS NAME", "EFFECTIVE DATE", "FILING ZIP"];
  const fieldIndex = buildFieldIndex(analyzeHeaders(header));

  it("flags a missing business name as a blocking error", () => {
    const result = normalizeAndValidateRow(["", "01/05/2026", "43215"], fieldIndex);
    expect(result.record).toBeNull();
    expect(result.errors[0]?.code).toBe("BUSINESS_NAME_REQUIRED");
  });

  it("produces a normalized record for a valid row", () => {
    const result = normalizeAndValidateRow(
      ["Buckeye Ventures LLC", "01/05/2026", "07001"],
      fieldIndex,
    );
    expect(result.record).not.toBeNull();
    expect(result.record?.filingZip).toBe("07001");
    expect(result.record?.normalizedBusinessName).toBe("BUCKEYE VENTURES LLC");
  });

  it("keeps the row valid but warns on an invalid date", () => {
    const result = normalizeAndValidateRow(
      ["Dayton Dynamics LLC", "13/45/2026", ""],
      fieldIndex,
    );
    expect(result.record).not.toBeNull();
    expect(result.record?.effectiveDate).toBeNull();
    expect(result.warnings.some((w) => w.code === "INVALID_DATE")).toBe(true);
  });
});
