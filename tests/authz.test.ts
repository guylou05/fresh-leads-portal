import { describe, expect, it } from "vitest";
import {
  AuthzError,
  ensureNotLastActiveAdmin,
  ensureNotSelfDisable,
  isAdmin,
  type BasicUser,
} from "@/lib/authz";

const admin: BasicUser = { id: "admin_1", role: "ADMIN", status: "ACTIVE" };
const user: BasicUser = { id: "user_1", role: "USER", status: "ACTIVE" };

describe("isAdmin", () => {
  it("returns true for ADMIN", () => {
    expect(isAdmin({ role: "ADMIN" })).toBe(true);
  });
  it("returns false for USER and nullish", () => {
    expect(isAdmin({ role: "USER" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});

describe("ensureNotSelfDisable", () => {
  it("throws when actor disables themselves", () => {
    expect(() => ensureNotSelfDisable(admin.id, admin)).toThrow(AuthzError);
  });
  it("does not throw when disabling another user", () => {
    expect(() => ensureNotSelfDisable("someone_else", admin)).not.toThrow();
  });
});

describe("ensureNotLastActiveAdmin", () => {
  it("throws when the target is the final active admin", () => {
    expect(() => ensureNotLastActiveAdmin(admin, 1)).toThrow(AuthzError);
  });
  it("allows removal when other active admins exist", () => {
    expect(() => ensureNotLastActiveAdmin(admin, 2)).not.toThrow();
  });
  it("allows removal of a non-admin regardless of count", () => {
    expect(() => ensureNotLastActiveAdmin(user, 1)).not.toThrow();
  });
  it("allows removal of an already-disabled admin", () => {
    const disabledAdmin: BasicUser = {
      id: "admin_2",
      role: "ADMIN",
      status: "DISABLED",
    };
    expect(() => ensureNotLastActiveAdmin(disabledAdmin, 1)).not.toThrow();
  });
});
