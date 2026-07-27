import { parse } from "csv-parse";
import type { Readable } from "node:stream";

export type ParsedRow = {
  /** 1-based data row number (the header is not counted). */
  rowNumber: number;
  values: string[];
  /** True when the column count differs from the header. */
  malformed: boolean;
};

const PARSE_OPTIONS = {
  bom: true, // strip a UTF-8 BOM if present
  skip_empty_lines: true,
  relax_column_count: true, // don't throw on ragged rows; we flag them instead
  relax_quotes: true, // tolerate imperfect quoting
  trim: false, // preserve field content; trimming happens in normalization
} as const;

/**
 * Stream a CSV/TXT input. The first record is treated as the header. The
 * handler is awaited per data row, so large files are processed without being
 * fully materialized in memory.
 */
export async function parseCsv(
  input: Readable,
  handler: (row: ParsedRow, header: string[]) => Promise<void> | void,
): Promise<{ header: string[]; dataRowCount: number }> {
  const parser = input.pipe(parse(PARSE_OPTIONS));

  let header: string[] | null = null;
  let dataRowCount = 0;

  for await (const record of parser as AsyncIterable<string[]>) {
    if (header === null) {
      header = record;
      continue;
    }
    dataRowCount += 1;
    await handler(
      {
        rowNumber: dataRowCount,
        values: record,
        malformed: record.length !== header.length,
      },
      header,
    );
  }

  return { header: header ?? [], dataRowCount };
}

/** Read only the header row (used for fast up-front validation). */
export async function parseHeaderOnly(input: Readable): Promise<string[]> {
  const parser = input.pipe(parse(PARSE_OPTIONS));
  try {
    for await (const record of parser as AsyncIterable<string[]>) {
      return record;
    }
    return [];
  } finally {
    parser.destroy();
    input.destroy();
  }
}
