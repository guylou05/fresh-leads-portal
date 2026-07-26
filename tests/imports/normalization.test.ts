import { describe, expect, it } from "vitest";
import {
  normalizeBusinessName,
  normalizeState,
  normalizeZip,
  parseEffectiveDate,
} from "@/lib/imports/normalization";

describe("business name normalization", () => {
  it("collapses whitespace and uppercases for matching", () => {
    expect(normalizeBusinessName("  Buckeye   Ventures  LLC ")).toBe(
      "BUCKEYE VENTURES LLC",
    );
  });

  it("normalizes punctuation and ampersands for matching only", () => {
    expect(normalizeBusinessName("Smith, Jones & Co. LLC")).toBe(
      "SMITH JONES AND CO LLC",
    );
  });
});

describe("state normalization", () => {
  it("uppercases and trims", () => {
    expect(normalizeState(" oh ")).toBe("OH");
  });
  it("returns null for empty", () => {
    expect(normalizeState("   ")).toBeNull();
  });
});

describe("zip normalization", () => {
  it("preserves leading zeros as a string", () => {
    expect(normalizeZip("07001")).toBe("07001");
  });
  it("supports ZIP+4", () => {
    expect(normalizeZip(" 43215-1234 ")).toBe("43215-1234");
  });
  it("returns null for empty", () => {
    expect(normalizeZip("")).toBeNull();
  });
});

describe("date parsing", () => {
  it("parses MM/DD/YYYY", () => {
    const result = parseEffectiveDate("01/05/2026");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.date?.toISOString().slice(0, 10)).toBe("2026-01-05");
    }
  });

  it("parses ISO dates", () => {
    const result = parseEffectiveDate("2026-02-04");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.date?.toISOString().slice(0, 10)).toBe("2026-02-04");
    }
  });

  it("treats empty input as a valid null date", () => {
    const result = parseEffectiveDate("");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.date).toBeNull();
  });

  it("rejects an impossible date without guessing", () => {
    expect(parseEffectiveDate("13/45/2026").ok).toBe(false);
  });

  it("rejects unrecognized formats", () => {
    expect(parseEffectiveDate("Jan 5, 2026").ok).toBe(false);
  });
});
