import { describe, expect, it } from "vitest";
import {
  emailField,
  formatCentsUsd,
  normalizePhone,
  parseEstimatedValueToCents,
  parseFollowUpDate,
  websiteField,
  workflowFieldsSchema,
} from "@/lib/leads/validation";

describe("email field", () => {
  it("lowercases and allows blank", () => {
    expect(emailField.parse("Foo@Bar.com")).toBe("foo@bar.com");
    expect(emailField.parse("")).toBeNull();
  });
  it("rejects invalid email", () => {
    expect(() => emailField.parse("not-an-email")).toThrow();
  });
});

describe("website field", () => {
  it("prefixes https:// for a bare domain", () => {
    expect(websiteField.parse("example.com")).toBe("https://example.com/");
  });
  it("keeps an explicit protocol", () => {
    expect(websiteField.parse("http://x.io")).toBe("http://x.io/");
  });
  it("allows blank and rejects garbage", () => {
    expect(websiteField.parse("")).toBeNull();
    expect(() => websiteField.parse("not a url")).toThrow();
  });
});

describe("estimated value → cents", () => {
  it("parses whole dollars", () => {
    expect(parseEstimatedValueToCents("2500")).toEqual({ ok: true, cents: 250000 });
  });
  it("parses cents and strips formatting", () => {
    expect(parseEstimatedValueToCents("$2,500.50")).toEqual({ ok: true, cents: 250050 });
  });
  it("treats blank as null", () => {
    expect(parseEstimatedValueToCents("")).toEqual({ ok: true, cents: null });
    expect(parseEstimatedValueToCents(null)).toEqual({ ok: true, cents: null });
  });
  it("rejects invalid amounts", () => {
    expect(parseEstimatedValueToCents("abc").ok).toBe(false);
    expect(parseEstimatedValueToCents("-5").ok).toBe(false);
    expect(parseEstimatedValueToCents("1.234").ok).toBe(false);
  });
  it("formats cents as USD", () => {
    expect(formatCentsUsd(250050)).toBe("$2,500.50");
    expect(formatCentsUsd(null)).toBe("—");
  });
});

describe("phone normalization", () => {
  it("keeps digits and a leading +", () => {
    expect(normalizePhone("(614) 555-1234")).toBe("6145551234");
    expect(normalizePhone("+1 614 555 1234")).toBe("+16145551234");
    expect(normalizePhone("")).toBeNull();
  });
});

describe("follow-up date parsing", () => {
  it("accepts ISO / datetime-local and blank", () => {
    expect(parseFollowUpDate("2026-08-10T14:30").ok).toBe(true);
    expect(parseFollowUpDate("").ok).toBe(true);
  });
  it("rejects garbage", () => {
    expect(parseFollowUpDate("not-a-date").ok).toBe(false);
  });
});

describe("workflow schema", () => {
  it("accepts blank optional fields", () => {
    const result = workflowFieldsSchema.safeParse({
      primaryContactName: "",
      primaryEmail: "",
      website: "",
    });
    expect(result.success).toBe(true);
  });
});
