import { normalizePhone as normalizeLeadPhone } from "@/lib/leads/validation";

/** Re-export the shared phone normalizer for matching/comparison. */
export function normalizePhone(raw: string | null | undefined): string | null {
  return normalizeLeadPhone(raw);
}

/**
 * Normalize a URL to a canonical https form: lowercase host, strip default
 * ports, drop the fragment, and trim a trailing slash. Returns null if invalid.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let candidate = raw.trim();
  if (candidate.length === 0) return null;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    url.hash = "";
    let out = url.toString();
    out = out.replace(/\/$/, "");
    return out;
  } catch {
    return null;
  }
}

/** Registrable-ish domain (host without a leading www). */
export function extractDomain(url: string | null | undefined): string | null {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/** Normalize an email: lowercase the domain, keep the local part. Null if invalid. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  const candidate = `${local}@${domain}`;
  return EMAIL_RE.test(candidate) ? candidate : null;
}

const ROLE_PREFIXES = ["info", "contact", "hello", "sales", "support", "office", "admin", "team"];
export function isRoleBasedEmail(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return ROLE_PREFIXES.includes(local);
}

const PLACEHOLDER_LOCALS = ["no-reply", "noreply", "donotreply", "example", "email", "you", "your", "name", "user", "test", "sentry"];
const VENDOR_DOMAINS = ["sentry.io", "wixpress.com", "wordpress.com", "godaddy.com", "squarespace.com", "example.com", "domain.com", "yourdomain.com", "sentry.wixpress.com"];

/** Reject placeholders, no-reply, and known vendor/tracking addresses. */
export function isRejectedEmail(email: string): boolean {
  const [local, domain] = email.split("@");
  if (!local || !domain) return true;
  const l = local.toLowerCase();
  if (PLACEHOLDER_LOCALS.some((p) => l === p || l.startsWith(`${p}.`) || l.startsWith(`${p}@`))) return true;
  if (l.includes("noreply") || l.includes("no-reply")) return true;
  if (VENDOR_DOMAINS.includes(domain.toLowerCase())) return true;
  return false;
}

const DIRECTORY_DOMAINS = [
  "yelp.com", "yellowpages.com", "bbb.org", "mapquest.com", "manta.com",
  "bizapedia.com", "dnb.com", "opencorporates.com", "buzzfile.com",
  "chamberofcommerce.com", "superpages.com", "citysearch.com", "angi.com",
  "thumbtack.com", "indeed.com", "glassdoor.com",
];
const SOCIAL_DOMAINS = [
  "facebook.com", "fb.com", "linkedin.com", "instagram.com", "twitter.com",
  "x.com", "youtube.com", "youtu.be", "tiktok.com", "pinterest.com",
];

/** True when the host is a business directory/aggregator (not an official site). */
export function isDirectoryDomain(host: string | null): boolean {
  if (!host) return false;
  const h = host.replace(/^www\./, "").toLowerCase();
  return DIRECTORY_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** True when the host is a social network (not an official website). */
export function isSocialDomain(host: string | null): boolean {
  if (!host) return false;
  const h = host.replace(/^www\./, "").toLowerCase();
  return SOCIAL_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

const PARKED_MARKERS = [
  "domain for sale", "buy this domain", "this domain is parked",
  "parked domain", "godaddy", "domain is for sale", "sedo", "hugedomains",
  "future home of", "website coming soon", "under construction",
];

/** Heuristic parked/placeholder-domain detection from title/body text. */
export function looksParked(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return PARKED_MARKERS.some((m) => t.includes(m));
}

export type SocialPlatform = "facebook" | "linkedin" | "instagram" | "x" | "youtube";

const SHARE_OR_LOGIN = ["/sharer", "/share", "/login", "/signup", "intent/tweet", "/dialog/"];

/**
 * Classify + normalize a social URL to a public business profile, rejecting
 * share/login/intent URLs and bare platform homepages. Returns null otherwise.
 */
export function classifySocialUrl(
  raw: string,
): { platform: SocialPlatform; url: string } | null {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const path = url.pathname.replace(/\/$/, "");
  const full = `${host}${path}`.toLowerCase();
  if (SHARE_OR_LOGIN.some((s) => full.includes(s))) return null;
  const hasProfile = path.length > 1; // must point past the homepage

  if ((host === "facebook.com" || host === "fb.com") && hasProfile) {
    return { platform: "facebook", url: normalized };
  }
  if (host === "linkedin.com" && /\/(company|in|school)\//.test(path)) {
    return { platform: "linkedin", url: normalized };
  }
  if (host === "instagram.com" && hasProfile) {
    return { platform: "instagram", url: normalized };
  }
  if ((host === "twitter.com" || host === "x.com") && hasProfile) {
    return { platform: "x", url: normalized };
  }
  if ((host === "youtube.com" || host === "youtu.be") && hasProfile) {
    return { platform: "youtube", url: normalized };
  }
  return null;
}
