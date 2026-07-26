import { describe, expect, it } from "vitest";
import {
  assertCanDeleteImportBatch,
  canUploadImports,
} from "@/lib/imports/permissions";
import { AuthzError } from "@/lib/authz";

describe("upload permissions", () => {
  it("allows any authenticated user", () => {
    expect(canUploadImports({ role: "USER" })).toBe(true);
    expect(canUploadImports({ role: "ADMIN" })).toBe(true);
  });
  it("blocks anonymous users", () => {
    expect(canUploadImports(null)).toBe(false);
  });
});

describe("failed import deletion restrictions", () => {
  it("blocks non-admins", () => {
    expect(() =>
      assertCanDeleteImportBatch(
        { role: "USER" },
        { status: "FAILED", importedRows: 0 },
      ),
    ).toThrow(AuthzError);
  });

  it("blocks deletion of non-failed/cancelled batches", () => {
    expect(() =>
      assertCanDeleteImportBatch(
        { role: "ADMIN" },
        { status: "COMPLETED", importedRows: 0 },
      ),
    ).toThrow(AuthzError);
  });

  it("blocks deletion when records were imported", () => {
    expect(() =>
      assertCanDeleteImportBatch(
        { role: "ADMIN" },
        { status: "FAILED", importedRows: 5 },
      ),
    ).toThrow(AuthzError);
  });

  it("allows an admin to delete a clean failed batch", () => {
    expect(() =>
      assertCanDeleteImportBatch(
        { role: "ADMIN" },
        { status: "FAILED", importedRows: 0 },
      ),
    ).not.toThrow();
  });

  it("allows an admin to delete a cancelled batch", () => {
    expect(() =>
      assertCanDeleteImportBatch(
        { role: "ADMIN" },
        { status: "CANCELLED", importedRows: 0 },
      ),
    ).not.toThrow();
  });
});
