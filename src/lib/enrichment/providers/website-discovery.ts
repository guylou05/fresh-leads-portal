import { safeFetch } from "@/lib/enrichment/security/safe-fetch";
import { EnrichmentError } from "@/lib/enrichment/errors";
import {
  extractDomain,
  isDirectoryDomain,
  isSocialDomain,
  looksParked,
  normalizeUrl,
} from "@/lib/enrichment/normalization";
import { businessNameAppears } from "@/lib/enrichment/providers/contact-extractor";
import { clampConfidence } from "@/lib/enrichment/confidence";
import type { LeadEnrichmentInput } from "@/lib/enrichment/types";

export type WebsiteCandidate = {
  url: string;
  source: "google_places" | "manual" | "heuristic";
  baseConfidence: number;
};

export type VerifiedWebsite = {
  url: string;
  source: string;
  confidence: number;
  matchReason: string;
  homepageHtml: string;
  statusCode: number;
} | null;

/** Build ordered website candidates (most trustworthy first). No fabrication. */
export function buildWebsiteCandidates(
  input: LeadEnrichmentInput,
  googleWebsite: string | null,
): WebsiteCandidate[] {
  const candidates: WebsiteCandidate[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null, source: WebsiteCandidate["source"], base: number) => {
    const normalized = normalizeUrl(raw);
    if (!normalized) return;
    const domain = extractDomain(normalized);
    if (!domain || isDirectoryDomain(domain) || isSocialDomain(domain)) return;
    if (seen.has(domain)) return;
    seen.add(domain);
    candidates.push({ url: normalized, source, baseConfidence: base });
  };
  push(googleWebsite, "google_places", 70);
  push(input.manualWebsite, "manual", 55);
  return candidates;
}

/**
 * Verify website candidates by fetching the homepage (SSRF-guarded), rejecting
 * parked/directory/social sites, and scoring confidence from the available
 * evidence. Returns the first accepted candidate, or null.
 */
export async function discoverWebsite(
  input: LeadEnrichmentInput,
  opts: {
    googleWebsite: string | null;
    googleMatchStrong: boolean;
    userAgent: string;
    timeoutMs: number;
    maxBytes: number;
  },
): Promise<VerifiedWebsite> {
  const candidates = buildWebsiteCandidates(input, opts.googleWebsite);

  for (const candidate of candidates) {
    let html: string;
    let statusCode: number;
    try {
      const res = await safeFetch(candidate.url, {
        timeoutMs: opts.timeoutMs,
        maxBytes: opts.maxBytes,
        userAgent: opts.userAgent,
        requireText: true,
      });
      if (res.status >= 400) continue;
      html = res.body;
      statusCode = res.status;
    } catch (error) {
      if (error instanceof EnrichmentError) continue;
      continue;
    }

    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
    if (looksParked(`${title} ${html.slice(0, 2000)}`)) continue;

    const nameOnPage = businessNameAppears(html, input.businessName);
    let confidence = candidate.baseConfidence;
    const reasons: string[] = [];
    if (candidate.source === "google_places") reasons.push("Declared by Google Places");
    if (candidate.source === "manual") reasons.push("Manually entered website");
    if (nameOnPage) {
      confidence += 20;
      reasons.push("Business name appears on site");
    }
    if (opts.googleMatchStrong) {
      confidence += 10;
      reasons.push("Strong Google match");
    }
    // A heuristic/manual candidate must show identity to be trusted.
    if (candidate.source !== "google_places" && !nameOnPage) {
      confidence = Math.min(confidence, 40);
    }

    return {
      url: candidate.url,
      source: candidate.source === "google_places" ? "Google Places" : "Manual entry",
      confidence: clampConfidence(confidence),
      matchReason: reasons.join("; ") || "Reachable website",
      homepageHtml: html,
      statusCode,
    };
  }

  return null;
}
