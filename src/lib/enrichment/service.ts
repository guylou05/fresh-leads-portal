import type {
  BusinessRecord,
  EnrichmentScope,
  LeadProfile,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { recordAudit } from "@/lib/audit";
import { buildLeadWhere, type LeadFilters } from "@/lib/leads/query";
import { EnrichmentError } from "@/lib/enrichment/errors";
import {
  DEFAULT_OPERATIONS,
  type EnrichmentOperations,
  type EnrichmentOptions,
  type LeadEnrichmentInput,
  type ProviderResult,
} from "@/lib/enrichment/types";
import {
  classifyMatch,
  scoreGoogleCandidate,
  type MatchClassification,
} from "@/lib/enrichment/matching";
import { googlePlacesLookup } from "@/lib/enrichment/providers/google-places";
import { discoverWebsite } from "@/lib/enrichment/providers/website-discovery";
import { crawlSite } from "@/lib/enrichment/providers/website-crawler";
import { extractFromPage } from "@/lib/enrichment/providers/contact-extractor";
import { normalizePhone, normalizeUrl } from "@/lib/enrichment/normalization";
import { computeOverallConfidence } from "@/lib/enrichment/confidence";
import { computeExpiry, isFresh } from "@/lib/enrichment/cache";
import { operationsToStrategy } from "@/lib/enrichment/jobs";
import { getEnrichmentQueue, type EnrichmentJobData } from "@/lib/enrichment/queue";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getEnrichmentSettings() {
  const existing = await prisma.enrichmentSettings.findUnique({
    where: { id: "singleton" },
  });
  if (existing) return existing;
  return prisma.enrichmentSettings.create({
    data: {
      id: "singleton",
      dailyLeadLimit: env.ENRICHMENT_DAILY_LEAD_LIMIT,
      cacheDays: env.ENRICHMENT_DEFAULT_CACHE_DAYS,
      retryLimit: env.ENRICHMENT_MAX_RETRIES,
      requestTimeoutMs: env.ENRICHMENT_REQUEST_TIMEOUT_MS,
      websiteCrawlEnabled: env.WEBSITE_CRAWL_ENABLED === "true",
      websitePageLimit: env.WEBSITE_CRAWL_MAX_PAGES,
      costCeilingCents: env.ENRICHMENT_COST_CEILING_CENTS,
    },
  });
}

export function parseOptions(raw: Prisma.JsonValue | null): EnrichmentOptions {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ops = (obj.operations && typeof obj.operations === "object"
    ? obj.operations
    : {}) as Partial<EnrichmentOperations>;
  return {
    operations: {
      googlePlaces: ops.googlePlaces ?? DEFAULT_OPERATIONS.googlePlaces,
      websiteDiscovery: ops.websiteDiscovery ?? DEFAULT_OPERATIONS.websiteDiscovery,
      websiteCrawl: ops.websiteCrawl ?? DEFAULT_OPERATIONS.websiteCrawl,
      phone: ops.phone ?? DEFAULT_OPERATIONS.phone,
      email: ops.email ?? DEFAULT_OPERATIONS.email,
      social: ops.social ?? DEFAULT_OPERATIONS.social,
    },
    skipRecentlyEnriched: Boolean(obj.skipRecentlyEnriched ?? true),
    cacheDays: Number(obj.cacheDays ?? env.ENRICHMENT_DEFAULT_CACHE_DAYS),
    retryFailed: Boolean(obj.retryFailed ?? false),
    maxLeads: obj.maxLeads == null ? null : Number(obj.maxLeads),
    reviewConfidenceThreshold: Number(obj.reviewConfidenceThreshold ?? 60),
    forceRefresh: Boolean(obj.forceRefresh ?? false),
  };
}

// ---------------------------------------------------------------------------
// Scope resolution + estimation
// ---------------------------------------------------------------------------

export async function resolveScopeRecordIds(params: {
  scope: EnrichmentScope;
  businessRecordIds?: string[];
  importBatchId?: string;
  filters?: LeadFilters;
  limit: number;
}): Promise<string[]> {
  const { scope, businessRecordIds, importBatchId, filters, limit } = params;
  if (scope === "SELECTED_LEADS" || scope === "SINGLE_LEAD") {
    return (businessRecordIds ?? []).slice(0, limit);
  }
  if (scope === "IMPORT_BATCH") {
    if (!importBatchId) return [];
    const rows = await prisma.businessRecord.findMany({
      where: { importBatchId },
      select: { id: true },
      take: limit,
    });
    return rows.map((r) => r.id);
  }
  // FILTERED_RESULTS
  const rows = await prisma.businessRecord.findMany({
    where: buildLeadWhere(filters ?? {}),
    select: { id: true },
    take: limit,
  });
  return rows.map((r) => r.id);
}

function startOfToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export async function countLeadsEnrichedToday(): Promise<number> {
  return prisma.enrichmentLeadJob.count({
    where: { createdAt: { gte: startOfToday() } },
  });
}

// ---------------------------------------------------------------------------
// Job creation
// ---------------------------------------------------------------------------

export async function createEnrichmentJob(params: {
  userId: string;
  scope: EnrichmentScope;
  options: EnrichmentOptions;
  recordIds: string[];
}): Promise<{ jobId: string; queued: number; skipped: number }> {
  const settings = await getEnrichmentSettings();
  const { userId, scope, options } = params;

  // Enforce the per-job cap and the daily application limit.
  const maxPerJob = settings.maxLeadsPerJob;
  let recordIds = params.recordIds.slice(0, options.maxLeads ?? maxPerJob);
  recordIds = recordIds.slice(0, maxPerJob);

  const usedToday = await countLeadsEnrichedToday();
  const remainingToday = Math.max(0, settings.dailyLeadLimit - usedToday);
  if (remainingToday <= 0) {
    throw new EnrichmentError("DAILY_LIMIT_REACHED");
  }
  recordIds = recordIds.slice(0, remainingToday);
  if (recordIds.length === 0) {
    throw new EnrichmentError("NO_MATCH", "No eligible leads to enrich.");
  }

  // Skip fresh cached results unless forcing a refresh.
  let skipped = 0;
  let eligible = recordIds;
  if (options.skipRecentlyEnriched && !options.forceRefresh) {
    const existing = await prisma.businessEnrichment.findMany({
      where: { businessRecordId: { in: recordIds } },
      select: { businessRecordId: true, lastSuccessfulEnrichmentAt: true },
    });
    const freshSet = new Set(
      existing
        .filter((e) => isFresh(e.lastSuccessfulEnrichmentAt, options.cacheDays))
        .map((e) => e.businessRecordId),
    );
    eligible = recordIds.filter((id) => !freshSet.has(id));
    skipped = recordIds.length - eligible.length;
  }

  if (eligible.length === 0) {
    throw new EnrichmentError("NO_MATCH", "All selected leads are already fresh.");
  }

  const strategy = operationsToStrategy(options.operations);

  const job = await prisma.enrichmentJob.create({
    data: {
      requestedById: userId,
      status: "QUEUED",
      scope,
      providerStrategy: strategy,
      totalLeads: eligible.length,
      queuedLeads: eligible.length,
      skippedLeads: skipped,
      options: options as unknown as Prisma.InputJsonValue,
    },
  });

  // Create per-lead job rows + mark enrichment QUEUED.
  await prisma.$transaction(async (tx) => {
    for (const businessRecordId of eligible) {
      const leadProfile = await tx.leadProfile.findUnique({
        where: { businessRecordId },
        select: { id: true },
      });
      await tx.enrichmentLeadJob.create({
        data: {
          enrichmentJobId: job.id,
          businessRecordId,
          leadProfileId: leadProfile?.id ?? null,
          status: "QUEUED",
        },
      });
      await tx.businessEnrichment.upsert({
        where: { businessRecordId },
        create: { businessRecordId, enrichmentStatus: "QUEUED" },
        update: { enrichmentStatus: "QUEUED" },
      });
    }
  });

  const leadJobs = await prisma.enrichmentLeadJob.findMany({
    where: { enrichmentJobId: job.id },
    select: { id: true, businessRecordId: true },
  });

  // Enqueue with idempotent BullMQ job ids (no duplicate active work per lead-job).
  const queue = getEnrichmentQueue();
  await queue.addBulk(
    leadJobs.map((lj) => ({
      name: "enrich-lead",
      data: {
        enrichmentJobId: job.id,
        enrichmentLeadJobId: lj.id,
        businessRecordId: lj.businessRecordId,
      } satisfies EnrichmentJobData,
      opts: { jobId: lj.id },
    })),
  );

  await prisma.enrichmentJob.update({
    where: { id: job.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  await recordAudit({
    userId,
    action: "enrichment.job.created",
    entityType: "EnrichmentJob",
    entityId: job.id,
    metadata: { scope, strategy, leads: eligible.length, skipped },
  });

  return { jobId: job.id, queued: eligible.length, skipped };
}

export async function cancelEnrichmentJob(
  jobId: string,
  userId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.enrichmentJob.update({
      where: { id: jobId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await tx.enrichmentLeadJob.updateMany({
      where: { enrichmentJobId: jobId, status: { in: ["QUEUED", "PROCESSING"] } },
      data: { status: "CANCELLED" },
    });
  });
  await recordAudit({
    userId,
    action: "enrichment.job.cancelled",
    entityType: "EnrichmentJob",
    entityId: jobId,
  });
}

// ---------------------------------------------------------------------------
// Per-lead processing (invoked by the worker)
// ---------------------------------------------------------------------------

function buildInput(
  record: BusinessRecord & { leadProfile: LeadProfile | null },
): LeadEnrichmentInput {
  return {
    businessRecordId: record.id,
    businessName: record.businessName,
    normalizedBusinessName: record.normalizedBusinessName,
    entityType: record.entityType,
    filingAddress1: record.filingAddress1,
    filingCity: record.filingCity,
    filingState: record.filingState,
    filingZip: record.filingZip,
    businessCity: record.businessCity,
    county: record.county,
    manualWebsite: record.leadProfile?.website ?? null,
    manualPhone: record.leadProfile?.primaryPhone ?? null,
  };
}

const SOCIAL_FIELD: Record<string, ProviderResult["field"]> = {
  facebook: "facebookUrl",
  linkedin: "linkedinUrl",
  instagram: "instagramUrl",
  x: "xUrl",
  youtube: "youtubeUrl",
};

async function bumpParent(
  jobId: string,
  bucket: "successfulLeads" | "partialLeads" | "failedLeads" | "skippedLeads",
): Promise<void> {
  await prisma.enrichmentJob.update({
    where: { id: jobId },
    data: { processedLeads: { increment: 1 }, [bucket]: { increment: 1 } },
  });
  await maybeFinalizeParent(jobId);
}

async function maybeFinalizeParent(jobId: string): Promise<void> {
  const job = await prisma.enrichmentJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "CANCELLED") return;
  if (job.processedLeads >= job.totalLeads) {
    await prisma.enrichmentJob.update({
      where: { id: jobId },
      data: {
        status: job.failedLeads > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Process one lead: run enabled providers, evaluate + persist results without
 * overwriting higher-confidence or manual values, write source attribution,
 * compute confidence, and update job/enrichment status. Never fabricates data.
 */
export async function processLeadJob(leadJobId: string): Promise<void> {
  const leadJob = await prisma.enrichmentLeadJob.findUnique({
    where: { id: leadJobId },
    include: { enrichmentJob: true },
  });
  if (!leadJob) return;
  if (leadJob.enrichmentJob.status === "CANCELLED") {
    await prisma.enrichmentLeadJob.update({
      where: { id: leadJobId },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    return;
  }

  const record = await prisma.businessRecord.findUnique({
    where: { id: leadJob.businessRecordId },
    include: { leadProfile: true, enrichment: true },
  });
  if (!record) {
    await prisma.enrichmentLeadJob.update({
      where: { id: leadJobId },
      data: { status: "FAILED", failureCode: "UNKNOWN_ERROR", completedAt: new Date() },
    });
    await bumpParent(leadJob.enrichmentJobId, "failedLeads");
    return;
  }

  const settings = await getEnrichmentSettings();
  const options = parseOptions(leadJob.enrichmentJob.options);

  // Cost ceiling guard.
  if (
    settings.costCeilingCents > 0 &&
    (leadJob.enrichmentJob.actualCostCents ?? 0) >= settings.costCeilingCents
  ) {
    await prisma.enrichmentLeadJob.update({
      where: { id: leadJobId },
      data: { status: "SKIPPED", failureCode: "COST_LIMIT_REACHED", completedAt: new Date() },
    });
    await bumpParent(leadJob.enrichmentJobId, "skippedLeads");
    return;
  }

  await prisma.enrichmentLeadJob.update({
    where: { id: leadJobId },
    data: { status: "PROCESSING", startedAt: new Date(), attemptCount: { increment: 1 } },
  });
  await prisma.businessEnrichment.upsert({
    where: { businessRecordId: record.id },
    create: { businessRecordId: record.id, enrichmentStatus: "PROCESSING" },
    update: { enrichmentStatus: "PROCESSING" },
  });

  const input = buildInput(record);
  const now = new Date();
  const results: ProviderResult[] = [];
  const conflicts: string[] = [];
  const usage: { provider: string; operation: string; requestCount: number; estCents: number }[] = [];
  const crawlRows: Prisma.WebsiteCrawlResultCreateManyInput[] = [];

  let googleWebsite: string | null = null;
  let googlePhone: string | null = null;
  let googleMatch: MatchClassification | null = null;
  let chosenPlace: Record<string, unknown> | null = null;
  let websiteVerified = false;

  try {
    // 1) Google Places
    if (options.operations.googlePlaces) {
      try {
        const { candidates, requestCount } = await googlePlacesLookup(input, {
          apiKey: env.GOOGLE_MAPS_API_KEY,
          timeoutMs: settings.requestTimeoutMs,
        });
        usage.push({
          provider: "google_places",
          operation: "textsearch+details",
          requestCount,
          estCents: Math.round(requestCount * env.GOOGLE_PLACES_COST_PER_CALL_CENTS),
        });
        const scored = candidates.map((c) => scoreGoogleCandidate(input, c));
        const { classification, best } = classifyMatch(scored);
        googleMatch = classification;
        if (best && (classification === "HIGH_CONFIDENCE" || classification === "MEDIUM_CONFIDENCE")) {
          const c = best.candidate;
          googleWebsite = c.website;
          googlePhone = c.phone;
          chosenPlace = { ...c, score: best.score, reasons: best.reasons };
          results.push({
            field: "googlePlace",
            value: c.placeId,
            source: "Google Places",
            confidence: best.score,
            matchReason: best.reasons.join("; "),
            metadata: { name: c.name, address: c.address, status: c.businessStatus, category: c.types[0] ?? null },
            retrievedAt: now,
          });
          if (c.website) {
            const nu = normalizeUrl(c.website);
            if (nu) results.push({ field: "website", value: nu, source: "Google Places", sourceUrl: nu, confidence: 70, matchReason: "Declared by Google Places", retrievedAt: now });
          }
          if (c.phone) {
            results.push({ field: "phone", value: c.phone, normalizedValue: normalizePhone(c.phone), source: "Google Places", confidence: classification === "HIGH_CONFIDENCE" ? 80 : 65, matchReason: best.reasons.join("; "), retrievedAt: now });
          }
        }
      } catch (error) {
        // A missing/invalid key or provider outage should not abort other providers.
        if (!(error instanceof EnrichmentError)) throw error;
      }
    }

    // 2) Website discovery + verification
    let verified: Awaited<ReturnType<typeof discoverWebsite>> = null;
    if (options.operations.websiteDiscovery) {
      verified = await discoverWebsite(input, {
        googleWebsite,
        googleMatchStrong: googleMatch === "HIGH_CONFIDENCE",
        userAgent: env.WEBSITE_CRAWL_USER_AGENT,
        timeoutMs: settings.requestTimeoutMs,
        maxBytes: env.WEBSITE_CRAWL_MAX_BYTES,
      });
      if (verified) {
        websiteVerified = true;
        const combinedSource =
          googleWebsite && normalizeUrl(googleWebsite) === verified.url
            ? "Google Places + verified website"
            : verified.source;
        results.push({ field: "website", value: verified.url, source: combinedSource, sourceUrl: verified.url, confidence: verified.confidence, matchReason: verified.matchReason, retrievedAt: now });
      }
    }

    // 3) Crawl + extraction
    if (verified) {
      let pages: { pageUrl: string; html: string }[] = [
        { pageUrl: verified.url, html: verified.homepageHtml },
      ];
      if (options.operations.websiteCrawl && settings.websiteCrawlEnabled) {
        const crawled = await crawlSite(
          verified.url,
          {
            maxPages: settings.websitePageLimit,
            delayMs: env.WEBSITE_CRAWL_DELAY_MS,
            timeoutMs: settings.requestTimeoutMs,
            maxBytes: env.WEBSITE_CRAWL_MAX_BYTES,
            userAgent: env.WEBSITE_CRAWL_USER_AGENT,
          },
          verified.homepageHtml,
        );
        for (const p of crawled) {
          crawlRows.push({
            businessRecordId: record.id,
            enrichmentJobId: leadJob.enrichmentJobId,
            websiteUrl: verified.url,
            pageUrl: p.pageUrl,
            pageType: p.pageType,
            statusCode: p.statusCode,
            title: p.title,
            crawlStatus: p.status,
            errorCode: p.errorCode,
            crawledAt: now,
          });
        }
        const withHtml = crawled.filter((p) => p.html);
        if (withHtml.length > 0) pages = withHtml.map((p) => ({ pageUrl: p.pageUrl, html: p.html }));
      }

      const extractions = pages.map((p) => extractFromPage(p.html, p.pageUrl));

      if (options.operations.email) {
        const emailCands = extractions.flatMap((e) => e.emails);
        const primary = [...emailCands].sort(
          (a, b) => Number(b.roleBased) - Number(a.roleBased) || Number(b.fromMailto) - Number(a.fromMailto),
        )[0];
        if (primary) {
          results.push({ field: "publicEmail", value: primary.email, normalizedValue: primary.email, source: primary.fromMailto ? "Website mailto link" : "Official website", sourceUrl: primary.sourceUrl, confidence: primary.roleBased ? 85 : 70, matchReason: "Found on verified website", retrievedAt: now });
        }
      }

      if (options.operations.phone) {
        const phoneCands = extractions.flatMap((e) => e.phones);
        const primary = phoneCands[0];
        if (primary) {
          const agrees = googlePhone != null && normalizePhone(googlePhone) === primary.normalized;
          if (googlePhone && !agrees) conflicts.push("Phone conflict between Google and website");
          results.push({ field: "phone", value: primary.display, normalizedValue: primary.normalized, source: agrees ? "Google Places and official website agree" : "Official website", sourceUrl: primary.sourceUrl, confidence: agrees ? 95 : 75, matchReason: agrees ? "Google and website phone agree" : "Found on verified website", retrievedAt: now });
        }
      }

      const contactPage = pages.find((p) => /contact/i.test(p.pageUrl));
      if (contactPage) {
        results.push({ field: "contactPageUrl", value: contactPage.pageUrl, source: "Verified website", sourceUrl: contactPage.pageUrl, confidence: 80, retrievedAt: now });
      }

      if (options.operations.social) {
        const socialSeen = new Set<string>();
        for (const s of extractions.flatMap((e) => e.social)) {
          const field = SOCIAL_FIELD[s.platform];
          if (field && !socialSeen.has(field)) {
            socialSeen.add(field);
            results.push({ field, value: s.url, source: "Verified website", sourceUrl: s.sourceUrl, confidence: 80, retrievedAt: now });
          }
        }
      }
    }

    await persistLeadResults({
      record,
      leadJob,
      options,
      settings,
      results,
      crawlRows,
      usage,
      conflicts,
      googleMatch,
      websiteVerified,
      chosenPlace,
    });
  } catch (error) {
    const code = error instanceof EnrichmentError ? error.code : "UNKNOWN_ERROR";
    await prisma.enrichmentLeadJob.update({
      where: { id: leadJobId },
      data: { status: "FAILED", failureCode: code, failureMessage: null, completedAt: new Date() },
    });
    await prisma.businessEnrichment.update({
      where: { businessRecordId: record.id },
      data: { enrichmentStatus: "FAILED", lastEnrichedAt: now },
    });
    await bumpParent(leadJob.enrichmentJobId, "failedLeads");
    throw error; // let BullMQ apply retry/backoff
  }
}

async function persistLeadResults(ctx: {
  record: BusinessRecord & { enrichment: { website: string | null; websiteSource: string | null; websiteConfidence: number | null; phone: string | null; phoneSource: string | null; phoneConfidence: number | null; publicEmail: string | null; emailSource: string | null; emailConfidence: number | null } | null };
  leadJob: { id: string; enrichmentJobId: string };
  options: EnrichmentOptions;
  settings: { cacheDays: number; reviewConfidenceThreshold: number };
  results: ProviderResult[];
  crawlRows: Prisma.WebsiteCrawlResultCreateManyInput[];
  usage: { provider: string; operation: string; requestCount: number; estCents: number }[];
  conflicts: string[];
  googleMatch: MatchClassification | null;
  websiteVerified: boolean;
  chosenPlace: Record<string, unknown> | null;
}): Promise<void> {
  const { record, leadJob, options, settings, results, conflicts } = ctx;
  const now = new Date();
  const expiresAt = computeExpiry(now, settings.cacheDays);
  const existing = record.enrichment;

  const pick = (field: ProviderResult["field"]): ProviderResult | undefined =>
    results
      .filter((r) => r.field === field)
      .sort((a, b) => b.confidence - a.confidence)[0];

  // Manual-override protection: never auto-overwrite a manual value or a
  // higher-confidence value (unless the job forces a refresh).
  const canWrite = (
    existingConfidence: number | null,
    existingSource: string | null,
    incomingConfidence: number,
  ): boolean => {
    if (existingSource && existingSource.startsWith("Manual") && !options.forceRefresh) return false;
    if (existingConfidence == null) return true;
    if (options.forceRefresh) return true;
    return incomingConfidence >= existingConfidence;
  };

  const website = pick("website");
  const phone = pick("phone");
  const email = pick("publicEmail");
  const contactPage = pick("contactPageUrl");
  const place = pick("googlePlace");
  const placeMeta = (ctx.chosenPlace ?? {}) as Record<string, unknown>;

  const data: Prisma.BusinessEnrichmentUpdateInput = { lastEnrichedAt: now };

  if (website && canWrite(existing?.websiteConfidence ?? null, existing?.websiteSource ?? null, website.confidence)) {
    data.website = website.value;
    data.websiteSource = website.source;
    data.websiteConfidence = website.confidence;
    data.websiteVerifiedAt = ctx.websiteVerified ? now : null;
  }
  if (phone && canWrite(existing?.phoneConfidence ?? null, existing?.phoneSource ?? null, phone.confidence)) {
    data.phone = phone.value;
    data.normalizedPhone = phone.normalizedValue ?? normalizePhone(phone.value);
    data.phoneSource = phone.source;
    data.phoneConfidence = phone.confidence;
    data.phoneVerifiedAt = now;
  }
  if (email && canWrite(existing?.emailConfidence ?? null, existing?.emailSource ?? null, email.confidence)) {
    data.publicEmail = email.value;
    data.emailSource = email.source;
    data.emailConfidence = email.confidence;
    data.emailVerifiedAt = now;
  }
  if (contactPage) data.contactPageUrl = contactPage.value;

  for (const [field, key] of [
    ["facebookUrl", "facebookUrl"], ["linkedinUrl", "linkedinUrl"],
    ["instagramUrl", "instagramUrl"], ["xUrl", "xUrl"], ["youtubeUrl", "youtubeUrl"],
  ] as const) {
    const r = pick(field);
    if (r) (data as Record<string, unknown>)[key] = r.value;
  }

  if (place) {
    data.googlePlaceId = place.value;
    data.googleBusinessName = (placeMeta.name as string) ?? null;
    data.googleBusinessStatus = (placeMeta.businessStatus as string) ?? null;
    data.googleAddress = (placeMeta.address as string) ?? null;
    const category = Array.isArray(placeMeta.types) ? (placeMeta.types as string[])[0] ?? null : null;
    data.googlePrimaryCategory = category;
    if (category) data.businessCategory = category;
  }

  const overall = computeOverallConfidence(
    {
      websiteConfidence: website?.confidence ?? null,
      phoneConfidence: phone?.confidence ?? null,
      emailConfidence: email?.confidence ?? null,
      googleMatch: ctx.googleMatch,
      websiteVerified: ctx.websiteVerified,
      hasEmail: Boolean(email),
      conflicts,
      sourceCount: results.length,
    },
    settings.reviewConfidenceThreshold,
  );
  data.overallConfidence = overall.score;
  data.manualReviewRequired = overall.needsReview;

  const hasData = Boolean(website || phone || email);
  let status: "ENRICHED" | "PARTIAL" | "NEEDS_REVIEW" | "FAILED";
  let leadStatus: "SUCCESS" | "PARTIAL" | "NEEDS_REVIEW" | "FAILED";
  if (overall.needsReview && hasData) {
    status = "NEEDS_REVIEW";
    leadStatus = "NEEDS_REVIEW";
  } else if (website && (phone || email)) {
    status = "ENRICHED";
    leadStatus = "SUCCESS";
  } else if (hasData || ctx.googleMatch === "HIGH_CONFIDENCE" || ctx.googleMatch === "MEDIUM_CONFIDENCE") {
    status = "PARTIAL";
    leadStatus = "PARTIAL";
  } else {
    status = "FAILED";
    leadStatus = "FAILED";
  }
  data.enrichmentStatus = status;
  if (status === "ENRICHED" || status === "PARTIAL" || status === "NEEDS_REVIEW") {
    data.lastSuccessfulEnrichmentAt = now;
  }

  await prisma.$transaction(async (tx) => {
    await tx.businessEnrichment.update({ where: { businessRecordId: record.id }, data });

    // Source attribution for every discovered value (history is never deleted).
    if (results.length > 0) {
      await tx.enrichmentSourceRecord.createMany({
        data: results.map((r) => ({
          businessRecordId: record.id,
          enrichmentJobId: leadJob.enrichmentJobId,
          provider: r.source,
          sourceType: r.field,
          sourceUrl: r.sourceUrl ?? null,
          fieldName: r.field,
          rawValue: r.value,
          normalizedValue: r.normalizedValue ?? null,
          confidence: r.confidence,
          matchReason: r.matchReason ?? null,
          metadata: (r.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          retrievedAt: r.retrievedAt,
          expiresAt,
        })),
      });
    }
    if (ctx.crawlRows.length > 0) {
      await tx.websiteCrawlResult.createMany({ data: ctx.crawlRows });
    }
    if (ctx.usage.length > 0) {
      await tx.enrichmentUsage.createMany({
        data: ctx.usage.map((u) => ({
          enrichmentJobId: leadJob.enrichmentJobId,
          provider: u.provider,
          operation: u.operation,
          requestCount: u.requestCount,
          estimatedCostCents: u.estCents,
        })),
      });
    }
    const totalCents = ctx.usage.reduce((a, u) => a + u.estCents, 0);
    await tx.enrichmentLeadJob.update({
      where: { id: leadJob.id },
      data: {
        status: leadStatus,
        completedAt: now,
        providerResults: {
          overallConfidence: overall.score,
          explanation: overall.explanation,
          fields: results.map((r) => ({ field: r.field, confidence: r.confidence, source: r.source })),
        } as Prisma.InputJsonValue,
      },
    });
    if (totalCents > 0) {
      await tx.enrichmentJob.update({
        where: { id: leadJob.enrichmentJobId },
        data: { actualCostCents: { increment: totalCents } },
      });
    }
  });

  await bumpParent(
    leadJob.enrichmentJobId,
    leadStatus === "SUCCESS" ? "successfulLeads" : leadStatus === "PARTIAL" ? "partialLeads" : leadStatus === "FAILED" ? "failedLeads" : "partialLeads",
  );

  // Record a single lead-activity summary only when a profile already exists
  // (enrichment must not create unnecessary LeadProfiles).
  const profile = await prisma.leadProfile.findUnique({
    where: { businessRecordId: record.id },
    select: { id: true },
  });
  if (profile) {
    const { recordActivity } = await import("@/lib/leads/activity");
    await recordActivity(prisma, {
      leadProfileId: profile.id,
      activityType: "CONTACT_UPDATED",
      title:
        status === "NEEDS_REVIEW"
          ? "Enrichment completed — needs review"
          : status === "FAILED"
            ? "Enrichment found no confident data"
            : "Enrichment completed",
      description: overall.explanation,
    });
  }
}
