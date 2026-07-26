# FreshBiz Leads — Phase 2 Completion Report

Phase 2 delivers the **business report import system**: authenticated users
upload Ohio Secretary of State reports (TXT/CSV), preview parsed and
de-duplicated data, import valid records into PostgreSQL, and browse the
imported businesses. Enrichment, AI, lead scoring, scraping, CRM export, and
email outreach are intentionally **out of scope**.

---

## Features completed

- **Upload** (`/imports/new`) with client progress, drag-to-select file input,
  and strict validation (extension, MIME, non-binary sniff, size limit).
- **Streaming parse** (`csv-parse`): UTF-8 BOM stripping, Windows CRLF, quoted
  fields with embedded commas, preserved empty columns, ragged-row flagging.
- **Header detection + canonical mapping** (case/spacing-insensitive), shown
  before import; unknown columns ignored; duplicate headers handled safely.
- **Report-type detection** (Domestic LLC / Nonprofit / For-Profit / Foreign /
  Unknown) with manual correction on confirm.
- **Normalization**: business names (matching form only; original preserved),
  states, ZIP-as-string (leading zeros, ZIP+4), MM/DD/YYYY + ISO dates
  (invalid dates → warnings, not guesses), address lines.
- **Deduplication**: deterministic `sourceRecordHash` + priority classifier
  (NEW / EXACT_DUPLICATE / POSSIBLE_DUPLICATE / INVALID), against existing DB
  records and within the same batch.
- **Preview → confirm workflow** with metrics, first-25 preview rows, and a
  duplicate estimate; exact duplicates auto-skipped, possible duplicates skipped
  by default (user may include).
- **Batched import execution** with `createMany` + a DB unique guard
  (`@@unique([source, sourceRecordHash])`) for concurrency safety; row-level
  errors never abort the run; DB failures fail the batch safely.
- **Import history** (`/imports`), **details** (`/imports/[id]`) with summary
  metrics, mapping, live progress polling, row errors, and invalid-rows CSV
  download.
- **Leads browsing**: server-side paginated/filtered/sorted table (`/leads`) and
  an official-filing **detail page** (`/leads/[id]`) linking back to its batch.
- **Audit logging** for upload, preview, start, complete, fail, cancel, delete,
  and invalid-row download.
- **Permissions**: all authenticated users upload/view; only ADMIN can delete a
  FAILED/CANCELLED batch with zero imported rows.
- Dashboard wired to real Total Leads / New Imports counts. Phase 1 preserved.

---

## Database changes

New migration `20260726231445_phase2_import_system` adds:

- **`ImportStatus`** enum: UPLOADED, VALIDATING, READY, IMPORTING, COMPLETED,
  COMPLETED_WITH_ERRORS, FAILED, CANCELLED.
- **`import_batches`** (`ImportBatch`): file metadata, checksum, source, report
  type, status, row counts, uploader, timestamps, error message, JSON metadata.
- **`business_records`** (`BusinessRecord`): all official filing fields +
  `normalizedBusinessName`, `sourceRecordHash`, `source`, batch/importer FKs.
  Indexed on documentNumber, charterNumber, effectiveDate, businessName,
  normalizedBusinessName, county, businessCity, sourceRecordHash, importBatchId,
  createdAt; `@@unique([source, sourceRecordHash])`.
- **`import_row_errors`** (`ImportRowError`): batch FK, rowNumber, rawData JSON,
  errorCode, errorMessage.

`documentNumber` / `charterNumber` are nullable (future reports may differ).

---

## Routes created

- Pages: `/imports`, `/imports/new`, `/imports/[id]`, `/leads` (rewritten),
  `/leads/[id]`.
- APIs: `POST /api/imports/upload`, `GET /api/imports/[id]/status`,
  `GET /api/imports/[id]/errors` (CSV).
- Server actions: `startImport`, `cancelImport`, `deleteImportBatch`.

---

## Import architecture

Modular services under `src/lib/imports/` keep parsing/validation independent of
React and reusable by a future background worker:

`config` · `storage` (sanitize, SHA-256, temp files) · `parser` (streaming) ·
`headers` (canonical mapping) · `normalization` · `report-type` · `validation`
(file + row) · `deduplication` (hash + classifier) · `service` (orchestration:
`analyzeFile`, `executeImport`, `buildImportSummary`) · `permissions`.

Flow: upload (validate → checksum → temp write → analyze → create READY batch) →
preview/confirm → `startImport` claims the batch atomically and runs
`executeImport` in the background → progress polled → COMPLETED /
COMPLETED_WITH_ERRORS / FAILED. Temp files are always cleaned up.

---

## Duplicate rules

1. source + document number → EXACT
2. source + charter number + effective date → EXACT
3. `sourceRecordHash` (source + normalized name + document + charter + date +
   city) → EXACT
4. normalized name + effective date + business city → POSSIBLE
5. normalized name + charter number → POSSIBLE

Exact always skipped; possible skipped by default; DB unique constraint prevents
concurrent-insert duplicates.

---

## Validation rules

- **File**: extension in {`.txt`, `.csv`}; non-empty; ≤ `MAX_IMPORT_FILE_SIZE_MB`;
  soft MIME check; NUL-byte binary sniff; sanitized file name; traversal-safe
  temp paths.
- **Row**: `Business Name` required (blocking → INVALID, recorded as a row error);
  unparseable non-empty date → non-blocking warning (date stored null); ragged
  rows flagged; missing document + charter → warning.

---

## Environment variables

- Existing: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`,
  `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- **New**: `MAX_IMPORT_FILE_SIZE_MB` (default `20`).

---

## Commands executed

| Command | Result |
| --- | --- |
| `npm install csv-parse` | Added streaming CSV parser |
| `npm run db:migrate` (phase2) | Migration created + applied |
| `npx prisma migrate deploy` (clean DB) | Both migrations applied successfully |
| `npm run db:seed` | Admin present |
| `npm run lint` | No warnings/errors |
| `npm run typecheck` | No errors |
| `npm test` | 83 passed (15 files) |
| `npm run build` | Succeeded (22 routes) |

---

## Test results

`npm test` → **83 tests passed** across 15 files. Phase 2 additions:

- `imports/parser.test.ts` — header/row parse, quoted commas, BOM, CRLF, malformed rows
- `imports/headers.test.ts` — header-variation mapping, missing business name, unknown/duplicate headers
- `imports/normalization.test.ts` — name/state/ZIP normalization, date parsing
- `imports/validation.test.ts` — file accept/reject (txt/csv/exe/empty/oversized), binary sniff, row validation
- `imports/deduplication.test.ts` — hash stability, exact/possible/new classification
- `imports/report-type.test.ts` — entity classification + detection
- `imports/summary.test.ts` — import summary calculations
- `imports/permissions.test.ts` — upload permissions + failed-import deletion restrictions
- `imports/fixture-integration.test.ts` — full pipeline over the sanitized Ohio fixture

A sanitized ~15-row Ohio fixture lives at `tests/fixtures/ohio-sample.txt`.

**End-to-end (manual):** uploading the fixture produced Total 15 / Valid 14 /
Imported 12 / Duplicates 2 / Skipped 2 / Invalid 1; the invalid row was reported
(`BUSINESS_NAME_REQUIRED`), duplicates were skipped, and imported records
appeared on the Leads page and detail view.

---

## Known limitations

- Imports run in-process on the persistent server (no Redis/BullMQ worker yet);
  suitable for typical daily Ohio reports. The service is structured for an easy
  future move to a worker.
- Temp uploads use ephemeral disk; a redeploy between upload and confirm loses
  the temp file and the import fails safely (re-upload).
- Analysis holds normalized rows in memory during a run — fine for typical
  reports, but very large files should move to the worker/streaming-insert model.
- "Possible duplicate" matching is intentionally conservative (name+date+city or
  name+charter); it will not catch heavily reworded names.
- Bulk actions/checkbox selection on Leads are present in the UI shell but not
  wired to operations in this phase.

---

## Recommended Phase 3 tasks

- Introduce a BullMQ (Redis) worker and move `executeImport` to it; stream
  inserts to remove the in-memory row buffer.
- Add an enrichment model + pipeline (public contact data) keyed to
  `BusinessRecord`, with provenance and confidence scoring.
- Persist per-batch warnings and expose a warnings report.
- Add saved Leads views/segments and bulk tagging built on the existing filters.
- Expand fixtures to cover foreign/nonprofit report variants.
