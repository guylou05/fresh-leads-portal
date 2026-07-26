import { describe, expect, it } from "vitest";
import {
  addToIndex,
  buildDedupeKeys,
  buildSourceRecordHash,
  classifyDuplicate,
  createDedupeIndex,
} from "@/lib/imports/deduplication";
import type { NormalizedRecord } from "@/lib/imports/types";

function makeRecord(overrides: Partial<NormalizedRecord> = {}): NormalizedRecord {
  const base: NormalizedRecord = {
    documentNumber: null,
    charterNumber: null,
    effectiveDate: null,
    businessName: "Acme LLC",
    normalizedBusinessName: "ACME LLC",
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
  return { ...base, ...overrides };
}

const SOURCE = "OH_SOS";

describe("source record hash", () => {
  it("is stable for the same normalized inputs", () => {
    const a = makeRecord({
      documentNumber: "1",
      effectiveDate: new Date(Date.UTC(2026, 0, 5, 12)),
      businessCity: "COLUMBUS",
    });
    const b = makeRecord({
      documentNumber: "1",
      effectiveDate: new Date(Date.UTC(2026, 0, 5, 12)),
      businessCity: "COLUMBUS",
    });
    expect(buildSourceRecordHash(SOURCE, a)).toBe(
      buildSourceRecordHash(SOURCE, b),
    );
  });

  it("differs when a stable field differs", () => {
    const a = makeRecord({ documentNumber: "1" });
    const b = makeRecord({ documentNumber: "2" });
    expect(buildSourceRecordHash(SOURCE, a)).not.toBe(
      buildSourceRecordHash(SOURCE, b),
    );
  });

  it("does not rely on business name alone (city changes the hash)", () => {
    const a = makeRecord({ businessCity: "COLUMBUS" });
    const b = makeRecord({ businessCity: "CLEVELAND" });
    expect(buildSourceRecordHash(SOURCE, a)).not.toBe(
      buildSourceRecordHash(SOURCE, b),
    );
  });
});

describe("duplicate classification", () => {
  it("detects an exact duplicate by document number", () => {
    const existing = createDedupeIndex();
    const first = makeRecord({ documentNumber: "202600000001" });
    addToIndex(existing, buildDedupeKeys(SOURCE, first));

    const seen = createDedupeIndex();
    const candidate = makeRecord({
      documentNumber: "202600000001",
      businessName: "Different Name LLC",
      normalizedBusinessName: "DIFFERENT NAME LLC",
    });
    expect(
      classifyDuplicate(buildDedupeKeys(SOURCE, candidate), existing, seen),
    ).toBe("EXACT_DUPLICATE");
  });

  it("detects an exact duplicate by identical hash", () => {
    const existing = createDedupeIndex();
    const rec = makeRecord({
      effectiveDate: new Date(Date.UTC(2026, 0, 7, 12)),
      businessCity: "CLEVELAND",
    });
    addToIndex(existing, buildDedupeKeys(SOURCE, rec));
    const seen = createDedupeIndex();
    expect(classifyDuplicate(buildDedupeKeys(SOURCE, rec), existing, seen)).toBe(
      "EXACT_DUPLICATE",
    );
  });

  it("detects a possible duplicate by name + date + city", () => {
    const existing = createDedupeIndex();
    const first = makeRecord({
      documentNumber: "10",
      normalizedBusinessName: "LAKE ERIE HOLDINGS LLC",
      effectiveDate: new Date(Date.UTC(2026, 0, 7, 12)),
      businessCity: "CLEVELAND",
    });
    addToIndex(existing, buildDedupeKeys(SOURCE, first));

    const candidate = makeRecord({
      documentNumber: null,
      normalizedBusinessName: "LAKE ERIE HOLDINGS LLC",
      effectiveDate: new Date(Date.UTC(2026, 0, 7, 12)),
      businessCity: "CLEVELAND",
    });
    const seen = createDedupeIndex();
    expect(
      classifyDuplicate(buildDedupeKeys(SOURCE, candidate), existing, seen),
    ).toBe("POSSIBLE_DUPLICATE");
  });

  it("classifies a novel record as NEW", () => {
    const existing = createDedupeIndex();
    const seen = createDedupeIndex();
    const rec = makeRecord({ documentNumber: "999", businessCity: "TOLEDO" });
    expect(classifyDuplicate(buildDedupeKeys(SOURCE, rec), existing, seen)).toBe(
      "NEW",
    );
  });
});
