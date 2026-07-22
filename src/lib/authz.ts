import type { UserRole, UserStatus } from "@prisma/client";

/** Thrown when an authorization invariant is violated. Safe to surface to users. */
export class AuthzError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthzError";
  }
}

export type BasicUser = {
  id: string;
  role: UserRole;
  status: UserStatus;
};

/** True when the given principal has the ADMIN role. */
export function isAdmin(
  principal?: { role?: UserRole | string | null } | null,
): boolean {
  return principal?.role === "ADMIN";
}

/**
 * Prevent an administrator from disabling their own active account, which would
 * otherwise be an easy way to lock oneself out.
 */
export function ensureNotSelfDisable(actorId: string, target: BasicUser): void {
  if (actorId === target.id) {
    throw new AuthzError("You cannot disable your own account.");
  }
}

/**
 * Prevent removal (disable or demotion) of the final active administrator so
 * the system always retains at least one usable admin.
 */
export function ensureNotLastActiveAdmin(
  target: BasicUser,
  activeAdminCount: number,
): void {
  const targetIsActiveAdmin =
    target.role === "ADMIN" && target.status === "ACTIVE";
  if (targetIsActiveAdmin && activeAdminCount <= 1) {
    throw new AuthzError(
      "You cannot remove the last active administrator. Assign another admin first.",
    );
  }
}
