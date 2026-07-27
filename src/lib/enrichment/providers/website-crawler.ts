import * as cheerio from "cheerio";
import type { WebsiteCrawlStatus } from "@prisma/client";
import { safeFetch } from "@/lib/enrichment/security/safe-fetch";
import { EnrichmentError } from "@/lib/enrichment/errors";

export type PageType = "home" | "contact" | "about" | "team" | "locations" | "legal" | "other";

export type CrawledPage = {
  pageUrl: string;
  pageType: PageType;
  statusCode: number | null;
  title: string | null;
  html: string;
  status: WebsiteCrawlStatus;
  errorCode: string | null;
};

export type CrawlConfig = {
  maxPages: number;
  delayMs: number;
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
};

const PAGE_KEYWORDS: Array<[PageType, RegExp]> = [
  ["contact", /contact/i],
  ["about", /about/i],
  ["team", /team|staff|people/i],
  ["locations", /location|find-us|stores/i],
  ["legal", /privacy|terms|legal/i],
];

function classifyPageType(pathname: string): PageType {
  for (const [type, re] of PAGE_KEYWORDS) if (re.test(pathname)) return type;
  return pathname === "/" || pathname === "" ? "home" : "other";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch and parse robots.txt (best effort). Returns disallowed path prefixes. */
async function fetchDisallow(origin: string, config: CrawlConfig): Promise<string[]> {
  try {
    const res = await safeFetch(`${origin}/robots.txt`, {
      timeoutMs: config.timeoutMs,
      maxBytes: 100_000,
      userAgent: config.userAgent,
    });
    const disallow: string[] = [];
    let applies = false;
    for (const line of res.body.split(/\r?\n/)) {
      const [rawKey, ...rest] = line.split(":");
      const key = rawKey?.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") applies = value === "*";
      else if (key === "disallow" && applies && value) disallow.push(value);
    }
    return disallow;
  } catch {
    return [];
  }
}

function isAllowed(pathname: string, disallow: string[]): boolean {
  return !disallow.some((d) => d !== "/" && pathname.startsWith(d)) &&
    !disallow.includes("/");
}

function pickInternalLinks(html: string, base: URL, limit: number): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const picked: { url: string; score: number }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let target: URL;
    try {
      target = new URL(href, base);
    } catch {
      return;
    }
    if (target.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return;
    target.hash = "";
    const key = target.toString();
    if (seen.has(key)) return;
    const type = classifyPageType(target.pathname);
    if (type === "other" || type === "home") return;
    seen.add(key);
    // Prefer contact/about pages first.
    const score = type === "contact" ? 3 : type === "about" ? 2 : 1;
    picked.push({ url: key, score });
  });
  return picked
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p) => p.url);
}

/**
 * Crawl a small set of public pages (homepage + contact/about/etc.), honoring
 * robots.txt, size/time/redirect limits, and SSRF protection. Static HTTP only.
 */
export async function crawlSite(
  startUrl: string,
  config: CrawlConfig,
  homepageHtml?: string,
): Promise<CrawledPage[]> {
  const base = new URL(startUrl);
  const disallow = await fetchDisallow(base.origin, config);
  const pages: CrawledPage[] = [];

  // Homepage (reuse the body discovery already fetched, if available).
  let homeHtml = homepageHtml ?? "";
  if (!homeHtml) {
    try {
      const res = await safeFetch(startUrl, { ...config, requireText: true });
      homeHtml = res.body;
      pages.push(makePage(res.finalUrl, "home", res.status, res.body, "SUCCESS"));
    } catch (error) {
      pages.push(errorPage(startUrl, "home", error));
      return pages;
    }
  } else {
    pages.push(makePage(startUrl, "home", 200, homeHtml, "SUCCESS"));
  }

  const links = pickInternalLinks(homeHtml, base, Math.max(0, config.maxPages - 1));
  for (const link of links) {
    if (pages.length >= config.maxPages) break;
    const path = new URL(link).pathname;
    if (!isAllowed(path, disallow)) {
      pages.push(makePage(link, classifyPageType(path), null, "", "SKIPPED"));
      continue;
    }
    await sleep(config.delayMs);
    try {
      const res = await safeFetch(link, { ...config, requireText: true });
      pages.push(makePage(res.finalUrl, classifyPageType(path), res.status, res.body, "SUCCESS"));
    } catch (error) {
      pages.push(errorPage(link, classifyPageType(path), error));
    }
  }
  return pages;
}

function makePage(
  pageUrl: string,
  pageType: PageType,
  statusCode: number | null,
  html: string,
  status: WebsiteCrawlStatus,
): CrawledPage {
  const title = html ? (cheerio.load(html)("title").first().text().trim() || null) : null;
  return { pageUrl, pageType, statusCode, title, html, status, errorCode: null };
}

function errorPage(pageUrl: string, pageType: PageType, error: unknown): CrawledPage {
  const code = error instanceof EnrichmentError ? error.code : "UNKNOWN_ERROR";
  const status: WebsiteCrawlStatus =
    code === "WEBSITE_TIMEOUT" ? "TIMEOUT" :
    code === "WEBSITE_BLOCKED" || code === "WEBSITE_UNSAFE" ? "BLOCKED" :
    "FAILED";
  return { pageUrl, pageType, statusCode: null, title: null, html: "", status, errorCode: code };
}
