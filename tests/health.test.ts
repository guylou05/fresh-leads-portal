import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns an ok status with a timestamp", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      status: string;
      service: string;
      timestamp: string;
    };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("freshbiz-leads");
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });

  it("does not leak environment values or secrets", async () => {
    const response = await GET();
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("DATABASE_URL");
    expect(text).not.toContain("AUTH_SECRET");
    expect(text).not.toContain("postgres");
  });
});
