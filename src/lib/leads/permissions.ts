import type { SegmentVisibility, UserRole, UserStatus } from "@prisma/client";
import { AuthzError, isAdmin } from "@/lib/authz";

type Principal = { id: string; role: UserRole } | null | undefined;

/** Only admins manage the tag catalog (create/rename/delete/merge). */
export function canManageTags(user: Principal): boolean {
  return isAdmin(user);
}

/** Note authors and admins may edit/delete a note. */
export function canModifyNote(
  user: Principal,
  note: { authorId: string },
): boolean {
  if (!user) return false;
  return isAdmin(user) || note.authorId === user.id;
}

/** Assignment targets must be active users. */
export function canReceiveAssignment(target: {
  status: UserStatus;
}): boolean {
  return target.status === "ACTIVE";
}

export function assertCanReceiveAssignment(target: {
  status: UserStatus;
}): void {
  if (!canReceiveAssignment(target)) {
    throw new AuthzError("Only active users can be assigned leads.");
  }
}

/** Who can view a segment: its owner, or anyone if it is SHARED. */
export function canViewSegment(
  user: Principal,
  segment: { ownerId: string; visibility: SegmentVisibility },
): boolean {
  if (!user) return false;
  return segment.visibility === "SHARED" || segment.ownerId === user.id;
}

/**
 * Who can modify/delete a segment: the owner may manage their own; admins may
 * manage SHARED segments. Admins may NOT manage another user's PRIVATE segment.
 */
export function canManageSegment(
  user: Principal,
  segment: { ownerId: string; visibility: SegmentVisibility },
): boolean {
  if (!user) return false;
  if (segment.ownerId === user.id) return true;
  return segment.visibility === "SHARED" && isAdmin(user);
}

/** Only admins may create SHARED segments. */
export function canCreateSharedSegment(user: Principal): boolean {
  return isAdmin(user);
}
