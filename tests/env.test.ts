import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db?schema=public",
  AUTH_SECRET: "a-very-long-secret-value-1234",
  AUTH_URL: "http://localhost:3000",
};

describe("environment validation", () => {
  it("parses a valid environment", () => {
    const env = parseEnv(validEnv);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.NODE_ENV).toBe("development");
  });

  it("throws when DATABASE_URL is missing", () => {
    const { DATABASE_URL: _omit, ...rest } = validEnv;
    expect(() => parseEnv(rest)).toThrowError(
      /DATABASE_URL/,
    );
  });

  it("throws when AUTH_SECRET is too short", () => {
    expect(() =>
      parseEnv({ ...validEnv, AUTH_SECRET: "short" }),
    ).toThrowError(/AUTH_SECRET/);
  });

  it("throws when AUTH_URL is not a URL", () => {
    expect(() =>
      parseEnv({ ...validEnv, AUTH_URL: "not-a-url" }),
    ).toThrowError(/AUTH_URL/);
  });

  it("rejects a weak optional ADMIN_PASSWORD", () => {
    expect(() =>
      parseEnv({ ...validEnv, ADMIN_PASSWORD: "short" }),
    ).toThrowError(/ADMIN_PASSWORD/);
  });
});
