import os from "node:os";
import path from "node:path";
import { env } from "@/env";

/** Default source label for Ohio Secretary of State reports. */
export const DEFAULT_SOURCE = "OH_SOS";

/** Allowed file extensions for import uploads. */
export const ALLOWED_EXTENSIONS = [".txt", ".csv"] as const;

/**
 * Allowed / tolerated MIME types. Browsers are inconsistent for .txt/.csv, so
 * these are used only as a soft signal — the extension + a binary-content sniff
 * are the authoritative checks (see `validation.ts`).
 */
export const ALLOWED_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/octet-stream",
  "",
] as const;

/** Maximum upload size in bytes, from MAX_IMPORT_FILE_SIZE_MB. */
export const MAX_IMPORT_FILE_SIZE_BYTES =
  env.MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024;

/** Number of valid rows shown in the preview. */
export const PREVIEW_ROW_LIMIT = 25;

/** Rows inserted per database batch during import execution. */
export const IMPORT_INSERT_BATCH_SIZE = 500;

/**
 * Directory for temporary upload processing. Uses the OS temp dir (ephemeral,
 * Railway-friendly) — never a path inside the repository.
 */
export function importTempDir(): string {
  return path.join(os.tmpdir(), "freshbiz-imports");
}
