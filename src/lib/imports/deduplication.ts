import crypto from "node:crypto";
import type { NormalizedRecord } from "@/lib/imports/types";

const SEP = "\u0001";

function toIsoDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** Uppercase/collapsed key form for a matching value. */
function matchKey(value: string | null): string {
  return value ? value.toUpperCase().replace(/\s+/g, " ").trim() : "";
}

/**
 * Stable content hash built from normalized, low-volatility fields. Two records
 * describing the same filing produce the same hash regardless of whitespace or
 * punctuation differences. Deliberately does NOT rely on business name alone.
 */
export function buildSourceRecordHash(
  source: string,
  record: NormalizedRecord,
): string {
  const parts = [
    source,
    record.normalizedBusinessName,
    record.documentNumber ?? "",
    record.charterNumber ?? "",
    toIsoDate(record.effectiveDate),
    matchKey(record.businessCity),
  ];
  return crypto.createHash("sha256").update(parts.join(SEP)).digest("hex");
}

export type DedupeKeys = {
  hash: string;
  documentKey: string | null;
  charterDateKey: string | null;
  nameDateCityKey: string | null;
  nameCharterKey: string | null;
};

/** Derive all dedupe keys for a record (deterministic). */
export function buildDedupeKeys(
  source: string,
  record: NormalizedRecord,
): DedupeKeys {
  const iso = toIsoDate(record.effectiveDate);
  const name = record.normalizedBusinessName;
  return {
    hash: buildSourceRecordHash(source, record),
    documentKey: record.documentNumber
      ? `${source}${SEP}${record.documentNumber}`
      : null,
    charterDateKey:
      record.charterNumber && iso
        ? `${source}${SEP}${record.charterNumber}${SEP}${iso}`
        : null,
    nameDateCityKey:
      name && iso && record.businessCity
        ? `${name}${SEP}${iso}${SEP}${matchKey(record.businessCity)}`
        : null,
    nameCharterKey:
      name && record.charterNumber
        ? `${name}${SEP}${record.charterNumber}`
        : null,
  };
}

/** In-memory sets of keys, either from the DB or accumulated within a batch. */
export type DedupeIndex = {
  documentKeys: Set<string>;
  charterDateKeys: Set<string>;
  hashes: Set<string>;
  nameDateCityKeys: Set<string>;
  nameCharterKeys: Set<string>;
};

export function createDedupeIndex(): DedupeIndex {
  return {
    documentKeys: new Set(),
    charterDateKeys: new Set(),
    hashes: new Set(),
    nameDateCityKeys: new Set(),
    nameCharterKeys: new Set(),
  };
}

export function addToIndex(index: DedupeIndex, keys: DedupeKeys): void {
  if (keys.documentKey) index.documentKeys.add(keys.documentKey);
  if (keys.charterDateKey) index.charterDateKeys.add(keys.charterDateKey);
  index.hashes.add(keys.hash);
  if (keys.nameDateCityKey) index.nameDateCityKeys.add(keys.nameDateCityKey);
  if (keys.nameCharterKey) index.nameCharterKeys.add(keys.nameCharterKey);
}

function matchesExact(keys: DedupeKeys, index: DedupeIndex): boolean {
  return (
    (keys.documentKey !== null && index.documentKeys.has(keys.documentKey)) ||
    (keys.charterDateKey !== null &&
      index.charterDateKeys.has(keys.charterDateKey)) ||
    index.hashes.has(keys.hash)
  );
}

function matchesPossible(keys: DedupeKeys, index: DedupeIndex): boolean {
  return (
    (keys.nameDateCityKey !== null &&
      index.nameDateCityKeys.has(keys.nameDateCityKey)) ||
    (keys.nameCharterKey !== null &&
      index.nameCharterKeys.has(keys.nameCharterKey))
  );
}

/**
 * Classify a valid row against existing (DB) and already-seen (this batch)
 * records. Deterministic priority: exact matches (document / charter+date /
 * hash) outrank possible matches (name+date+city / name+charter).
 */
export function classifyDuplicate(
  keys: DedupeKeys,
  existing: DedupeIndex,
  seenInBatch: DedupeIndex,
): "NEW" | "EXACT_DUPLICATE" | "POSSIBLE_DUPLICATE" {
  if (matchesExact(keys, existing) || matchesExact(keys, seenInBatch)) {
    return "EXACT_DUPLICATE";
  }
  if (matchesPossible(keys, existing) || matchesPossible(keys, seenInBatch)) {
    return "POSSIBLE_DUPLICATE";
  }
  return "NEW";
}
