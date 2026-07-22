import type { User } from "@prisma/client";

/** A user shape that is always safe to send to the client / session. */
export type SafeUser = Omit<User, "passwordHash">;

/**
 * Strip sensitive fields (the bcrypt hash) from a user record before it is
 * exposed to the client, a session token, or an API response.
 */
export function sanitizeUser(user: User): SafeUser {
  // Intentionally destructure the hash out so it can never leak.
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

/** The identity fields persisted into the Auth.js session token. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: User["role"];
};

/** Whether a user account is permitted to sign in. */
export function canSignIn(user: Pick<User, "status">): boolean {
  return user.status === "ACTIVE";
}
