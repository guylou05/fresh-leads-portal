import { readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/imports/parser";
import { analyzeHeaders, buildFieldIndex } from "@/lib/imports/headers";
import { normalizeAndValidateRow } from "@/lib/imports/validation";
import {
  addToIndex,
  buildDedupeKeys,
  classifyDuplicate,
  createDedupeIndex,
} from "@/lib/imports/deduplication";
import type { DuplicateClass } from "@/lib/imports/types";

const fixtureBuffer = readFileSync(
  path.join(process.cwd(), "tests/fixtures/ohio-sample.txt"),
);
const SOURCE = "OH_SOS";

/**
 * Mirrors the pure pipeline used by the import service (parse -> normalize ->
 * validate -> classify), against an empty existing index, so it needs no DB.
 */
async function analyzeFixture() {
  const header = await parseCsv(Readable.from(fixtureBuffer), () => {}).then(
    (r) => r.header,
  );
  const analysis = analyzeHeaders(header);
  const fieldIndex = buildFieldIndex(analysis);

  const existing = createDedupeIndex();
  const seen = createDedupeIndex();
  const counts = { total: 0, invalid: 0, exact: 0, possible: 0, newRows: 0 };

  await parseCsv(Readable.from(fixtureBuffer), (row) => {
    counts.total += 1;
    const { record } = normalizeAndValidateRow(row.values, fieldIndex, {
      malformed: row.malformed,
    });
    if (!record) {
      counts.invalid += 1;
      return;
    }
    const keys = buildDedupeKeys(SOURCE, record);
    const classification: DuplicateClass = classifyDuplicate(
      keys,
      existing,
      seen,
    );
    addToIndex(seen, keys);
    if (classification === "EXACT_DUPLICATE") counts.exact += 1;
    else if (classification === "POSSIBLE_DUPLICATE") counts.possible += 1;
    else counts.newRows += 1;
  });

  return { analysis, counts };
}

describe("Ohio fixture end-to-end pipeline", () => {
  it("detects the expected mapping and row classifications", async () => {
    const { analysis, counts } = await analyzeFixture();

    expect(analysis.hasBusinessName).toBe(true);
    expect(counts.total).toBe(15);
    expect(counts.invalid).toBe(1); // row with a missing business name
    expect(counts.exact).toBe(1); // duplicate document number
    expect(counts.possible).toBe(1); // same name + date + city, no doc number
    expect(counts.newRows).toBe(12);
    expect(counts.invalid + counts.exact + counts.possible + counts.newRows).toBe(
      15,
    );
  });
});
