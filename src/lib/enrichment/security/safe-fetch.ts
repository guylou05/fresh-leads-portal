import { EnrichmentError } from "@/lib/enrichment/errors";
import {
  assertResolvesToPublic,
  parseFetchableUrl,
} from "@/lib/enrichment/security/ssrf";

export type SafeFetchOptions = {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  /** Require an HTML/text content type (used when crawling pages). */
  requireText?: boolean;
};

export type SafeFetchResult = {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  bytes: number;
  redirects: number;
};

const TEXT_TYPES = ["text/html", "application/xhtml", "text/plain", "application/xml", "text/xml"];

/**
 * Fetch a URL with full SSRF protection: http(s) only, per-hop DNS validation
 * against private ranges (DNS-rebinding safe), bounded redirects, request
 * timeout, response-size cap, and optional content-type enforcement.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const {
    method = "GET",
    timeoutMs = 10000,
    maxBytes = 2_000_000,
    maxRedirects = 5,
    userAgent = "FreshBizLeadsBot/1.0",
    requireText = false,
  } = options;

  let currentUrl = rawUrl;
  let redirects = 0;

  for (;;) {
    const url = parseFetchableUrl(currentUrl);
    await assertResolvesToPublic(url.hostname);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": userAgent, accept: "text/html,*/*;q=0.8" },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new EnrichmentError("WEBSITE_TIMEOUT");
      }
      throw new EnrichmentError("WEBSITE_NOT_FOUND");
    }

    // Follow redirects manually so each hop is re-validated.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      redirects += 1;
      if (redirects > maxRedirects) {
        throw new EnrichmentError("WEBSITE_BLOCKED", "Too many redirects.");
      }
      currentUrl = new URL(location, url).toString();
      continue;
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (requireText && !TEXT_TYPES.some((t) => contentType.includes(t))) {
      // Do not download binary/unsupported content.
      try {
        await response.body?.cancel();
      } catch {
        /* ignore */
      }
      throw new EnrichmentError("PARSE_FAILED", "Unsupported content type.");
    }

    const { body, bytes } = await readCapped(response, maxBytes);
    return {
      finalUrl: url.toString(),
      status: response.status,
      contentType,
      body,
      bytes,
      redirects,
    };
  }

  throw new EnrichmentError("WEBSITE_NOT_FOUND", "Redirect without a location.");
}

async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ body: string; bytes: number }> {
  const reader = response.body?.getReader();
  if (!reader) return { body: "", bytes: 0 };

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.length;
      if (received > maxBytes) {
        await reader.cancel();
        throw new EnrichmentError("WEBSITE_BLOCKED", "Response exceeded size limit.");
      }
      chunks.push(value);
    }
  }
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { body: buffer.toString("utf8"), bytes: received };
}
