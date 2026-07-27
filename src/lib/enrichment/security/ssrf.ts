import dns from "node:dns/promises";
import net from "node:net";
import { EnrichmentError } from "@/lib/enrichment/errors";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Parse a URL and require an http(s) scheme with no embedded credentials. */
export function parseFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new EnrichmentError("WEBSITE_UNSAFE", "Malformed URL.");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new EnrichmentError(
      "WEBSITE_UNSAFE",
      `Unsupported URL scheme: ${url.protocol}`,
    );
  }
  if (url.username || url.password) {
    throw new EnrichmentError("WEBSITE_UNSAFE", "URLs with credentials are not allowed.");
  }
  return url;
}

/** Expand an IPv4-mapped IPv6 address (::ffff:a.b.c.d) to its IPv4 form. */
function unmapIpv4(ip: string): string {
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return m?.[1] ?? ip;
}

/**
 * True when an IP literal is private, loopback, link-local, multicast,
 * unspecified, or a cloud metadata endpoint — i.e. must never be fetched.
 */
export function isBlockedIp(rawIp: string): boolean {
  const ip = unmapIpv4(rawIp);

  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
    if (lower.startsWith("ff")) return true; // multicast
    return false;
  }

  // Not a valid IP literal → treat as unsafe.
  return true;
}

/** Reject hostnames that are obviously local before any DNS resolution. */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal") return true;
  if (net.isIP(h) && isBlockedIp(h)) return true;
  return false;
}

/**
 * Resolve a hostname and ensure EVERY resolved address is public. Protects
 * against DNS rebinding by validating the actual A/AAAA records used.
 */
export async function assertResolvesToPublic(hostname: string): Promise<string[]> {
  if (isBlockedHostname(hostname)) {
    throw new EnrichmentError("WEBSITE_UNSAFE", "Host is not permitted.");
  }
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new EnrichmentError("WEBSITE_UNSAFE", "IP address is not permitted.");
    }
    return [hostname];
  }
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new EnrichmentError("WEBSITE_NOT_FOUND", "Host could not be resolved.");
  }
  if (addresses.length === 0) {
    throw new EnrichmentError("WEBSITE_NOT_FOUND", "Host has no addresses.");
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new EnrichmentError("WEBSITE_UNSAFE", "Host resolves to a private address.");
    }
  }
  return addresses.map((a) => a.address);
}
