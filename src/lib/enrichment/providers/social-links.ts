import * as cheerio from "cheerio";
import {
  classifySocialUrl,
  type SocialPlatform,
} from "@/lib/enrichment/normalization";

export type SocialLink = { platform: SocialPlatform; url: string; sourceUrl: string };

/**
 * Extract public business social links from a page's anchors. Share/login/
 * intent URLs and bare homepages are rejected by `classifySocialUrl`.
 */
export function extractSocialLinks(html: string, pageUrl: string): SocialLink[] {
  const $ = cheerio.load(html);
  const found = new Map<SocialPlatform, SocialLink>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const classified = classifySocialUrl(href);
    if (classified && !found.has(classified.platform)) {
      found.set(classified.platform, {
        platform: classified.platform,
        url: classified.url,
        sourceUrl: pageUrl,
      });
    }
  });
  return [...found.values()];
}
