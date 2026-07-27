import { describe, expect, it } from "vitest";
import {
  classifySocialUrl,
  extractDomain,
  isDirectoryDomain,
  isRejectedEmail,
  isRoleBasedEmail,
  isSocialDomain,
  looksParked,
  normalizeEmail,
  normalizeUrl,
} from "@/lib/enrichment/normalization";

describe("URL normalization", () => {
  it("prefers https, lowercases host, strips trailing slash + fragment", () => {
    expect(normalizeUrl("HTTP://Example.com/path/#frag")).toBe("http://example.com/path");
    expect(normalizeUrl("example.com")).toBe("https://example.com");
  });
  it("extracts a domain without www", () => {
    expect(extractDomain("https://www.example.com/x")).toBe("example.com");
  });
});

describe("email normalization + filtering", () => {
  it("lowercases domain, keeps local part, validates", () => {
    expect(normalizeEmail("Info@Example.COM")).toBe("Info@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
  });
  it("flags role-based addresses", () => {
    expect(isRoleBasedEmail("info@x.com")).toBe(true);
    expect(isRoleBasedEmail("john@x.com")).toBe(false);
  });
  it("rejects no-reply, placeholder, and vendor addresses", () => {
    expect(isRejectedEmail("no-reply@x.com")).toBe(true);
    expect(isRejectedEmail("example@x.com")).toBe(true);
    expect(isRejectedEmail("hello@sentry.wixpress.com")).toBe(true);
    expect(isRejectedEmail("contact@realbusiness.com")).toBe(false);
  });
});

describe("directory/social/parked detection", () => {
  it("detects directory and social domains", () => {
    expect(isDirectoryDomain("yelp.com")).toBe(true);
    expect(isDirectoryDomain("realbusiness.com")).toBe(false);
    expect(isSocialDomain("facebook.com")).toBe(true);
  });
  it("detects parked-domain markers", () => {
    expect(looksParked("This domain is for sale on GoDaddy")).toBe(true);
    expect(looksParked("Welcome to our bakery")).toBe(false);
  });
});

describe("social URL classification", () => {
  it("accepts a business profile URL", () => {
    expect(classifySocialUrl("https://facebook.com/mybiz")).toEqual({
      platform: "facebook",
      url: "https://facebook.com/mybiz",
    });
  });
  it("rejects share/login/intent and bare homepages", () => {
    expect(classifySocialUrl("https://facebook.com/sharer/sharer.php?u=x")).toBeNull();
    expect(classifySocialUrl("https://facebook.com/")).toBeNull();
    expect(classifySocialUrl("https://twitter.com/intent/tweet")).toBeNull();
  });
});
