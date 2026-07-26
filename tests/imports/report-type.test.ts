import { describe, expect, it } from "vitest";
import {
  classifyEntityType,
  detectReportType,
} from "@/lib/imports/report-type";

describe("entity type classification", () => {
  it("classifies domestic LLCs", () => {
    expect(classifyEntityType("DOMESTIC LIMITED LIABILITY COMPANY")).toBe(
      "Domestic LLC",
    );
  });
  it("classifies nonprofits", () => {
    expect(classifyEntityType("DOMESTIC NONPROFIT CORPORATION")).toBe(
      "Domestic Nonprofit Corporation",
    );
  });
  it("classifies foreign LLCs", () => {
    expect(classifyEntityType("FOREIGN LIMITED LIABILITY COMPANY")).toBe(
      "Foreign LLC",
    );
  });
  it("returns null when unknown", () => {
    expect(classifyEntityType("SOMETHING ELSE")).toBeNull();
    expect(classifyEntityType(null)).toBeNull();
  });
});

describe("report type detection", () => {
  it("infers from a majority of transaction descriptions", () => {
    const detection = detectReportType({
      fileName: "report.txt",
      transactionSamples: [
        "DOMESTIC LIMITED LIABILITY COMPANY",
        "DOMESTIC LIMITED LIABILITY COMPANY",
        "DOMESTIC LIMITED LIABILITY COMPANY",
      ],
    });
    expect(detection.reportType).toBe("Domestic LLC");
    expect(detection.confidence).toBe("high");
  });

  it("falls back to the file name", () => {
    const detection = detectReportType({
      fileName: "2026_foreign_llc_report.csv",
      transactionSamples: [],
    });
    expect(detection.reportType).toBe("Foreign LLC");
  });

  it("returns Unknown at low confidence", () => {
    const detection = detectReportType({
      fileName: "report.csv",
      transactionSamples: [],
    });
    expect(detection.reportType).toBe("Unknown");
  });
});
