import { readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseCsv, parseHeaderOnly } from "@/lib/imports/parser";
import type { ParsedRow } from "@/lib/imports/parser";

const fixturePath = path.join(process.cwd(), "tests/fixtures/ohio-sample.txt");
const fixtureBuffer = readFileSync(fixturePath);

function streamFrom(content: Buffer | string): Readable {
  return Readable.from(
    typeof content === "string" ? Buffer.from(content, "utf8") : content,
  );
}

describe("csv parser", () => {
  it("parses the Ohio fixture header and all data rows", async () => {
    const rows: ParsedRow[] = [];
    const { header, dataRowCount } = await parseCsv(
      streamFrom(fixtureBuffer),
      (row) => {
        rows.push(row);
      },
    );
    expect(header[0]).toBe("DOCUMENT NUMBER");
    expect(header).toHaveLength(21);
    expect(dataRowCount).toBe(15);
    expect(rows).toHaveLength(15);
  });

  it("preserves commas inside quoted fields", async () => {
    const rows: ParsedRow[] = [];
    await parseCsv(streamFrom(fixtureBuffer), (row) => {
      rows.push(row);
    });
    // Row 2 (index 1) has a quoted business name containing a comma.
    expect(rows[1]?.values[3]).toBe("SMITH, JONES & CO LLC");
  });

  it("strips a UTF-8 BOM from the first header", async () => {
    const content = "\uFEFFBUSINESS NAME,COUNTY\nACME LLC,FRANKLIN\n";
    const header = await parseHeaderOnly(streamFrom(content));
    expect(header[0]).toBe("BUSINESS NAME");
  });

  it("flags rows whose column count differs from the header", async () => {
    const content = "A,B,C\n1,2,3\n1,2\n";
    const rows: ParsedRow[] = [];
    await parseCsv(streamFrom(content), (row) => {
      rows.push(row);
    });
    expect(rows[0]?.malformed).toBe(false);
    expect(rows[1]?.malformed).toBe(true);
  });

  it("handles Windows CRLF line endings", async () => {
    const content = "BUSINESS NAME,COUNTY\r\nACME LLC,FRANKLIN\r\n";
    const rows: ParsedRow[] = [];
    const { header } = await parseCsv(streamFrom(content), (row) => {
      rows.push(row);
    });
    expect(header).toEqual(["BUSINESS NAME", "COUNTY"]);
    expect(rows[0]?.values).toEqual(["ACME LLC", "FRANKLIN"]);
  });
});
