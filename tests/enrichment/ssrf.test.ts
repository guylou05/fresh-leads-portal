import { describe, expect, it } from "vitest";
import {
  isBlockedHostname,
  isBlockedIp,
  parseFetchableUrl,
} from "@/lib/enrichment/security/ssrf";
import { EnrichmentError } from "@/lib/enrichment/errors";

describe("SSRF IP blocking", () => {
  it("blocks loopback, private, link-local, and metadata addresses", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.5")).toBe(true);
    expect(isBlockedIp("172.16.4.9")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true); // cloud metadata
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("fd00::1")).toBe(true);
  });
  it("allows public addresses", () => {
    expect(isBlockedIp("93.184.216.34")).toBe(false); // example.com
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });
});

describe("SSRF hostname blocking", () => {
  it("blocks localhost, .local, .internal, and metadata host", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("printer.local")).toBe(true);
    expect(isBlockedHostname("db.internal")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("127.0.0.1")).toBe(true);
  });
  it("allows public hostnames", () => {
    expect(isBlockedHostname("example.com")).toBe(false);
  });
});

describe("URL scheme validation", () => {
  it("accepts http/https", () => {
    expect(parseFetchableUrl("https://example.com").protocol).toBe("https:");
    expect(parseFetchableUrl("http://example.com").protocol).toBe("http:");
  });
  it("rejects unsupported schemes and credentials", () => {
    for (const bad of ["file:///etc/passwd", "ftp://x", "data:text/html,x", "javascript:alert(1)", "gopher://x"]) {
      expect(() => parseFetchableUrl(bad)).toThrow(EnrichmentError);
    }
    expect(() => parseFetchableUrl("https://user:pass@example.com")).toThrow(EnrichmentError);
  });
});
