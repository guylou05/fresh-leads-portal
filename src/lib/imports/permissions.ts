import type { ImportStatus, UserRole } from "@prisma/client";
import { AuthzError, isAdmin } from "@/lib/authz";

/** Any active, authenticated user may upload and view imports/leads. */
export function canUploadImports(user?: { role?: UserRole } | null): boolean {
  return Boolean(user);
}

export type DeletableBatch = {
  status: ImportStatus;
  importedRows: number;
};

/**
 * An ADMIN may delete an ImportBatch only when it FAILED or was CANCELLED and
 * it produced no successfully imported records. Throws AuthzError otherwise.
 */
export function assertCanDeleteImportBatch(
  user: { role?: UserRole } | null | undefined,
  batch: DeletableBatch,
): void {
  if (!isAdmin(user)) {
    throw new AuthzError("Only administrators can delete import batches.");
  }
  if (batch.status !== "FAILED" && batch.status !== "CANCELLED") {
    throw new AuthzError(
      "Only failed or cancelled imports can be deleted.",
    );
  }
  if (batch.importedRows > 0) {
    throw new AuthzError(
      "This import has already imported records and cannot be deleted.",
    );
  }
}
