import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  businessNameAppears,
  extractFromPage,
} from "@/lib/enrichment/providers/contact-extractor";
import { extractSocialLinks } from "@/lib/enrichment/providers/social-links";
import { googlePlacesLookup } from "@/lib/enrichment/providers/google-places";
import { EnrichmentError } from "@/lib/enrichment/errors";
import type { LeadEnrichmentInput } from "@/lib/enrichment/types";

const html = readFileSync(
  path.join(process.cwd(), "tests/enrichment/fixtures/business-site.html"),
  "utf8",
);
const PAGE_URL = "https://buckeyeventures.example/";

describe("contact extraction", () => {
  const extraction = extractFromPage(html, PAGE_URL);

  it("extracts public business emails and rejects no-reply/vendor", () => {
    const emails = extraction.emails.map((e) => e.email);
    expect(emails).toContain("info@buckeyeventures.example");
    expect(emails).toContain("contact@buckeyeventures.example");
    expect(emails).not.toContain("no-reply@buckeyeventures.example");
  });

  it("prioritizes role-based addresses", () => {
    expect(extraction.emails.some((e) => e.roleBased)).toBe(true);
  });

  it("extracts a business phone from tel: and JSON-LD", () => {
    expect(extraction.phones.some((p) => p.normalized === "+16145550123")).toBe(true);
  });

  it("detects the business name on the page", () => {
    expect(businessNameAppears(html, "Buckeye Ventures LLC")).toBe(true);
    expect(businessNameAppears(html, "Totally Unrelated Corp")).toBe(false);
  });
});

describe("social link extraction", () => {
  it("accepts real profiles and rejects share URLs", () => {
    const links = extractSocialLinks(html, PAGE_URL);
    const platforms = links.map((l) => l.platform);
    expect(platforms).toContain("instagram");
    // The only facebook link is a /sharer/ URL, which must be rejected.
    expect(links.find((l) => l.platform === "facebook")).toBeUndefined();
  });
});

describe("google provider without a key", () => {
  it("throws INVALID_API_KEY", async () => {
    const input = { businessName: "X", normalizedBusinessName: "X" } as LeadEnrichmentInput;
    await expect(
      googlePlacesLookup(input, { apiKey: undefined, timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(EnrichmentError);
  });
});
