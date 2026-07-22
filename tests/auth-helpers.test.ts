import { describe, expect, it } from "vitest";
import type { User } from "@prisma/client";
import { canSignIn, sanitizeUser } from "@/lib/auth-helpers";

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "user_1",
    name: "Test User",
    email: "test@example.com",
    passwordHash: "$2a$12$hashedvalue",
    role: "USER",
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    ...overrides,
  };
}

describe("auth helpers", () => {
  it("strips the password hash from a user", () => {
    const safe = sanitizeUser(buildUser());
    expect("passwordHash" in safe).toBe(false);
    expect(safe.email).toBe("test@example.com");
  });

  it("allows active users to sign in", () => {
    expect(canSignIn(buildUser({ status: "ACTIVE" }))).toBe(true);
  });

  it("blocks disabled users from signing in", () => {
    expect(canSignIn(buildUser({ status: "DISABLED" }))).toBe(false);
  });
});
