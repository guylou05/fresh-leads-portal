import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { AuthzError } from "@/lib/authz";

export type SessionUser = {
  id: string;
  role: UserRole;
  name: string;
  email: string;
};

/** Return the current authenticated user or throw AuthzError. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthzError("You must be signed in to perform this action.");
  }
  return {
    id: session.user.id,
    role: session.user.role,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
  };
}
