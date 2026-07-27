import { describe, expect, it } from "vitest";
import {
  assertCanReceiveAssignment,
  canCreateSharedSegment,
  canManageSegment,
  canManageTags,
  canModifyNote,
  canReceiveAssignment,
  canViewSegment,
} from "@/lib/leads/permissions";
import { AuthzError } from "@/lib/authz";

const admin = { id: "a1", role: "ADMIN" as const };
const user = { id: "u1", role: "USER" as const };

describe("tag permissions", () => {
  it("only admins manage tags", () => {
    expect(canManageTags(admin)).toBe(true);
    expect(canManageTags(user)).toBe(false);
    expect(canManageTags(null)).toBe(false);
  });
});

describe("note permissions", () => {
  it("author or admin may modify", () => {
    expect(canModifyNote(user, { authorId: "u1" })).toBe(true);
    expect(canModifyNote(user, { authorId: "other" })).toBe(false);
    expect(canModifyNote(admin, { authorId: "other" })).toBe(true);
  });
});

describe("assignment restrictions", () => {
  it("allows active users", () => {
    expect(canReceiveAssignment({ status: "ACTIVE" })).toBe(true);
  });
  it("rejects disabled users", () => {
    expect(canReceiveAssignment({ status: "DISABLED" })).toBe(false);
    expect(() => assertCanReceiveAssignment({ status: "DISABLED" })).toThrow(
      AuthzError,
    );
  });
});

describe("segment permissions", () => {
  const priv = { ownerId: "u1", visibility: "PRIVATE" as const };
  const privOther = { ownerId: "other", visibility: "PRIVATE" as const };
  const shared = { ownerId: "other", visibility: "SHARED" as const };

  it("view: owner or shared", () => {
    expect(canViewSegment(user, priv)).toBe(true);
    expect(canViewSegment(user, privOther)).toBe(false);
    expect(canViewSegment(user, shared)).toBe(true);
  });

  it("manage: owner manages own; admin manages shared; admin cannot manage others' private", () => {
    expect(canManageSegment(user, priv)).toBe(true);
    expect(canManageSegment(user, shared)).toBe(false);
    expect(canManageSegment(admin, shared)).toBe(true);
    expect(canManageSegment(admin, privOther)).toBe(false);
  });

  it("only admins create shared segments", () => {
    expect(canCreateSharedSegment(admin)).toBe(true);
    expect(canCreateSharedSegment(user)).toBe(false);
  });
});
