import * as cheerio from "cheerio";
import {
  isRejectedEmail,
  isRoleBasedEmail,
  normalizeEmail,
  normalizePhone,
} from "@/lib/enrichment/normalization";
import {
  extractSocialLinks,
  type SocialLink,
} from "@/lib/enrichment/providers/social-links";

export type EmailCandidate = {
  email: string;
  sourceUrl: string;
  roleBased: boolean;
  fromMailto: boolean;
};
export type PhoneCandidate = {
  display: string;
  normalized: string;
  sourceUrl: string;
  fromTel: boolean;
};

export type PageExtraction = {
  emails: EmailCandidate[];
  phones: PhoneCandidate[];
  social: SocialLink[];
  title: string | null;
  businessNameOnPage: string | null;
};

const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Parse JSON-LD organization blocks for email/telephone/sameAs. */
function parseJsonLd($: cheerio.CheerioAPI): {
  emails: string[];
  phones: string[];
  socials: string[];
} {
  const emails: string[] = [];
  const phones: string[] = [];
  const socials: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const data: unknown = JSON.parse(raw);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (node && typeof node === "object") {
          const obj = node as Record<string, unknown>;
          if (typeof obj.email === "string") emails.push(obj.email);
          if (typeof obj.telephone === "string") phones.push(obj.telephone);
          const sameAs = obj.sameAs;
          if (Array.isArray(sameAs)) {
            for (const s of sameAs) if (typeof s === "string") socials.push(s);
          } else if (typeof sameAs === "string") {
            socials.push(sameAs);
          }
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return { emails, phones, socials };
}

/**
 * Extract only publicly displayed business contact info from a single page.
 * Emails/phones come from mailto:/tel: links, JSON-LD, and visible text;
 * placeholders, no-reply, and vendor addresses are rejected. Nothing is guessed.
 */
export function extractFromPage(html: string, pageUrl: string): PageExtraction {
  const $ = cheerio.load(html);
  const emails = new Map<string, EmailCandidate>();
  const phones = new Map<string, PhoneCandidate>();

  const addEmail = (raw: string, fromMailto: boolean) => {
    const normalized = normalizeEmail(raw);
    if (!normalized || isRejectedEmail(normalized)) return;
    const existing = emails.get(normalized);
    if (!existing || (fromMailto && !existing.fromMailto)) {
      emails.set(normalized, {
        email: normalized,
        sourceUrl: pageUrl,
        roleBased: isRoleBasedEmail(normalized),
        fromMailto,
      });
    }
  };
  const addPhone = (raw: string, fromTel: boolean) => {
    const normalized = normalizePhone(raw);
    if (!normalized || normalized.replace(/\D/g, "").length < 10) return;
    if (!phones.has(normalized)) {
      phones.set(normalized, { display: raw.trim(), normalized, sourceUrl: pageUrl, fromTel });
    }
  };

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    addEmail(href.replace(/^mailto:/i, "").split("?")[0] ?? "", true);
  });
  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    addPhone(href.replace(/^tel:/i, ""), true);
  });

  const jsonLd = parseJsonLd($);
  for (const e of jsonLd.emails) addEmail(e, false);
  for (const p of jsonLd.phones) addPhone(p, false);

  // Visible text emails (scripts/styles removed to avoid tracking/vendor noise).
  $("script, style, noscript").remove();
  const text = $("body").text();
  const matches = text.match(EMAIL_IN_TEXT) ?? [];
  for (const m of matches) addEmail(m, false);

  const social = extractSocialLinks(html, pageUrl);
  for (const s of jsonLd.socials) {
    const classified = extractSocialLinks(`<a href="${s}"></a>`, pageUrl);
    for (const c of classified) if (!social.some((x) => x.platform === c.platform)) social.push(c);
  }

  const title = $("title").first().text().trim() || null;
  const orgName =
    $('meta[property="og:site_name"]').attr("content")?.trim() || null;

  return {
    emails: [...emails.values()],
    phones: [...phones.values()],
    social,
    title,
    businessNameOnPage: orgName,
  };
}

/** True when the business name's significant tokens appear in the page text. */
export function businessNameAppears(html: string, businessName: string): boolean {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().toLowerCase();
  const tokens = businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["llc", "inc", "corp", "the", "company"].includes(t));
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => text.includes(t)).length;
  return hits / tokens.length >= 0.5;
}
