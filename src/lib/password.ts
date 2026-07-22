import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_COST = 12;

/** Shared password-strength policy. Reused by seed, settings, and admin flows. */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters long")
  .max(200, "Password must be at most 200 characters long");

export type PasswordValidationResult =
  | { success: true }
  | { success: false; error: string };

/** Validate a candidate password against the shared policy. */
export function validatePassword(candidate: unknown): PasswordValidationResult {
  const result = passwordSchema.safeParse(candidate);
  if (result.success) {
    return { success: true };
  }
  return {
    success: false,
    error: result.error.issues[0]?.message ?? "Invalid password",
  };
}

/** Hash a plain-text password using bcrypt. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** Verify a plain-text password against a bcrypt hash. */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}
