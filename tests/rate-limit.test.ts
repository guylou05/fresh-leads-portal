import { beforeEach, describe, expect, it } from "vitest";
import {
  __clearAllRateLimits,
  checkRateLimit,
  resetRateLimit,
} from "@/lib/rate-limit";

describe("rate limiter", () => {
  beforeEach(() => __clearAllRateLimits());

  it("allows attempts up to the limit then blocks", () => {
    const key = "login:test";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, { limit: 5 }).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, { limit: 5 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets a key after a successful login", () => {
    const key = "login:reset";
    checkRateLimit(key, { limit: 1 });
    expect(checkRateLimit(key, { limit: 1 }).allowed).toBe(false);
    resetRateLimit(key);
    expect(checkRateLimit(key, { limit: 1 }).allowed).toBe(true);
  });
});
