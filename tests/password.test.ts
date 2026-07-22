import { describe, expect, it } from "vitest";
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/password";

describe("password validation", () => {
  it("rejects passwords shorter than 10 characters", () => {
    const result = validatePassword("short");
    expect(result.success).toBe(false);
  });

  it("accepts passwords of at least 10 characters", () => {
    const result = validatePassword("longenough1");
    expect(result.success).toBe(true);
  });

  it("rejects non-string input", () => {
    expect(validatePassword(undefined).success).toBe(false);
    expect(validatePassword(12345).success).toBe(false);
  });
});

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const plain = "correct-horse-battery";
    const hash = await hashPassword(plain);
    expect(hash).not.toContain(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
  });

  it("fails verification for the wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("wrong-password-123", hash)).toBe(false);
  });

  it("returns false for an empty hash", async () => {
    expect(await verifyPassword("anything123", "")).toBe(false);
  });
});
