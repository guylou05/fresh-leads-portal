import { describe, expect, it } from "vitest";
import { normalizeTagName, tagInputSchema } from "@/lib/tags";

describe("tag normalization (case-insensitive uniqueness basis)", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeTagName("  Security   Camera ")).toBe("security camera");
    expect(normalizeTagName("SECURITY CAMERA")).toBe(
      normalizeTagName("security camera"),
    );
  });
});

describe("tag input validation", () => {
  it("accepts an approved palette color", () => {
    const result = tagInputSchema.safeParse({ name: "Prospect", color: "blue" });
    expect(result.success).toBe(true);
  });
  it("rejects arbitrary color values", () => {
    const result = tagInputSchema.safeParse({
      name: "Prospect",
      color: "#ff0000; background:url(x)",
    });
    expect(result.success).toBe(false);
  });
  it("requires a name", () => {
    expect(tagInputSchema.safeParse({ name: "", color: "slate" }).success).toBe(
      false,
    );
  });
});
