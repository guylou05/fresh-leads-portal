# FreshBiz Leads — Phase 4 Completion Report

Phase 4 delivers the **external business-enrichment engine**: authenticated
users enrich leads with *public* business information via an asynchronous,
Redis/BullMQ-backed worker. Enriched data is stored separately from official
filing data (`BusinessRecord`) and manual sales data (`LeadProfile`), every
field carries source attribution + confidence, and the system never invents
contact information. AI/OpenAI, AI segmentation/scoring, outreach, CRM export,
email/SMS, and billing are intentionally **out of scope**.

---

## Features completed

- Redis + BullMQ queue and a **separate worker process** (`npm run worker` /
  `worker:dev`) with configurable concurrency, exponential-backoff retries,
  heartbeat, and graceful shutdown; **PostgreSQL is the authoritative** job store.
- Modular **provider abstraction** (providers never touch the DB): Google Places
  (scoring + classification), website discovery + verification, SSRF-guarded
  website crawler (Cheerio), contact extraction, social-link extraction.
- **SSRF protection** on all URL fetching (scheme allow-list, private/link-local/
  multicast/metadata blocking, per-hop DNS re-validation, size/time/redirect/
  content-type limits).
- Field + overall **confidence** (0–100) with user-facing explanations; **source
  attribution** rows for every value; caching + `STALE`; idempotent jobs +
  force-refresh; **cost/daily limits + ceiling**; categorized failures.
- **Manual review** queue + overrides that are protected from automated overwrite;
  enrichment never writes to `LeadProfile` (explicit copy-to-profile only).
- Pages: `/enrichment`, `/enrichment/new`, `/enrichment/review`,
  `/settings/enrichment` (admin, no secrets), single-lead **Enrichment tab**;
  leads **enrichment filters**; `/api/health/worker`.
- Audit + lead-activity logging for enrichment events. Preserves Phases 1–3.

---

## Database changes

Migration `20260727024546_phase4_enrichment_engine` adds enums
(`EnrichmentJobStatus`, `EnrichmentScope`, `EnrichmentLeadStatus`,
`BusinessEnrichmentStatus`, `WebsiteCrawlStatus`) and models: `EnrichmentJob`,
`EnrichmentLeadJob` (unique `[enrichmentJobId, businessRecordId]`),
`BusinessEnrichment` (unique `businessRecordId`), `EnrichmentSourceRecord`,
`WebsiteCrawlResult`, `EnrichmentUsage`, and a single-row `EnrichmentSettings`.
Indexes cover enrichment/job status, `businessRecordId`, `enrichmentJobId`,
`website`, `normalizedPhone`, `publicEmail`, `googlePlaceId`, `lastEnrichedAt`,
`manualReviewRequired`, `nextRetryAt`, `provider`, and `retrievedAt`.

---

## Routes created

- Pages: `/enrichment`, `/enrichment/new`, `/enrichment/review`,
  `/settings/enrichment`; Enrichment tab on `/leads/[id]`.
- API: `/api/health/worker`.
- Server actions: create/cancel job, single-lead enrich/retry, manual override,
  mark reviewed, clear enrichment, copy-to-profile, admin settings.
- Worker entry: `src/worker/index.ts` (+ `run.ts`).

---

## Queue architecture

Parent `EnrichmentJob` + one `EnrichmentLeadJob` per record (persisted), enqueued
to BullMQ with the lead-job id as the BullMQ job id (no duplicate active work).
The worker processes each lead via `processLeadJob`, updates PostgreSQL, and
finalizes the parent when all children complete. Retries use exponential backoff;
cancellation flips DB status and short-circuits processing. Worker heartbeat is
published to Redis (TTL) and surfaced at `/api/health/worker`.

---

## Providers implemented

Google Places (Text Search + Details, scored/classified), Website Discovery
(Places/manual candidates verified via SSRF-guarded HTTP; parked/directory/
social rejected), Website Crawler (homepage + contact/about/etc., robots-aware),
Contact Extraction (mailto/tel/JSON-LD/visible; rejects no-reply/placeholder/
vendor; prefers role-based), Social Links (rejects share/login/homepage).

---

## Matching rules

Documented thresholds (`HIGH ≥ 80`, `MEDIUM ≥ 60`, `LOW ≥ 40`, ambiguity gap 10).
Signals: exact/overlapping name, city, ZIP, state, address similarity, website-
domain agreement, phone agreement. Penalties: different state, non-operational,
different city+ZIP, weak name. Rating/reviews are not used as proof; the first
result is never auto-selected. Two close strong candidates →
`MULTIPLE_POSSIBLE_MATCHES`.

---

## Confidence rules

Field confidences derive from evidence (Google + verified website agreement =
very high; verified website = high; directory-only = low; generated email =
prohibited). Overall combines field scores + match strength + source count −
conflicts, with a plain-language explanation and a `needsReview` flag when below
the threshold, on conflicts, or on multiple matches.

---

## Crawl limits

`WEBSITE_CRAWL_MAX_PAGES` (5), `WEBSITE_CRAWL_MAX_BYTES` (2 MB),
`WEBSITE_CRAWL_DELAY_MS` (750), `WEBSITE_CRAWL_TIMEOUT_MS` (10s), max 5 redirects,
text/HTML content types only, configured user agent, robots.txt best effort.

---

## Security controls

SSRF-safe fetch (`src/lib/enrichment/security/`): http(s)-only, credential-free
URLs; blocks localhost/`127.0.0.0/8`/`::1`/private v4+v6/link-local/multicast/
cloud metadata; re-resolves DNS after each redirect; enforces redirect/size/
timeout/content-type limits. Secrets stay server-side; extracted content is
rendered only as sanitized text; error categories never leak internals.

---

## Cache rules

Google/website ~30 days (`ENRICHMENT_DEFAULT_CACHE_DAYS`), configurable per job;
fresh leads skipped unless force-refreshed; expired → `STALE`; manual overrides
never auto-expire; historical `EnrichmentSourceRecord` rows are retained.

---

## Cost controls

Daily lead limit, per-job cap, cost ceiling (stops before exceeding), request
dedup via caching, `EnrichmentUsage` tracking. Integer-cents storage; Google
pricing from `GOOGLE_PLACES_COST_PER_CALL_CENTS` (0 = unknown → show request
counts). All admin-configurable via `/settings/enrichment` / env.

---

## Environment variables

`REDIS_URL`, `GOOGLE_MAPS_API_KEY`, `ENRICHMENT_WORKER_CONCURRENCY`,
`ENRICHMENT_MAX_RETRIES`, `ENRICHMENT_REQUEST_TIMEOUT_MS`,
`ENRICHMENT_DAILY_LEAD_LIMIT`, `ENRICHMENT_DEFAULT_CACHE_DAYS`,
`ENRICHMENT_COST_CEILING_CENTS`, `GOOGLE_PLACES_COST_PER_CALL_CENTS`,
`WEBSITE_CRAWL_ENABLED`, `WEBSITE_CRAWL_USER_AGENT`, `WEBSITE_CRAWL_MAX_PAGES`,
`WEBSITE_CRAWL_MAX_BYTES`, `WEBSITE_CRAWL_DELAY_MS`, `WEBSITE_CRAWL_TIMEOUT_MS`.
See `.env.example`.

---

## Railway deployment steps

Web · PostgreSQL · Redis · Worker (same repo, `npm run worker`). Reference
`${{Postgres.DATABASE_URL}}` / `${{Redis.REDIS_URL}}`; set `GOOGLE_MAPS_API_KEY`
+ tuning vars on both web and worker; web runs `prisma migrate deploy` on start
with healthcheck `/api/health`; the worker has no HTTP port (disable its HTTP
healthcheck; monitor via process status + heartbeat at `/api/health/worker`).
Deploy Postgres/Redis → Web → Worker. See README "Railway web + worker deployment".

---

## Commands executed

| Command | Result |
| --- | --- |
| `npm install bullmq ioredis cheerio dotenv` | Queue/parse/env deps added |
| `npm run db:migrate` (phase4) | Migration created + applied |
| `npx prisma migrate deploy` (clean DB) | All 4 migrations applied |
| `npm run lint` | No warnings/errors |
| `npm run typecheck` | No errors (web + worker) |
| `npm test` | 173 passed (28 files) |
| `npm run build` | Succeeded |
| `npm run worker` | Ready, heartbeat, graceful shutdown |

---

## Test results

`npm test` → **173 passed** (28 files). Phase 4 additions cover SSRF
(IP/hostname/scheme), URL/email normalization + directory/social/parked
detection, social URL classification (share/login rejection), Google candidate
scoring + classification, contact extraction (mailto/tel/JSON-LD; no-reply/vendor
rejection; role-based preference), provider no-key behavior, confidence + review
flags, cache freshness/staleness, idempotency keys, and cost estimation. A
sanitized HTML fixture (`tests/enrichment/fixtures/business-site.html`) is used.

**End-to-end (manual):** set a lead's website, ran single-lead enrichment; the
worker processed it asynchronously, verified the website with source
attribution, left the public email blank (no fabrication), assigned confidence
40, flagged it for review, completed the job, and reported worker online / Redis
connected on the dashboard.

---

## Known limitations

- Only Google Places is implemented among paid providers (by design); the
  provider interface is ready for Bing/SerpAPI/Hunter/etc.
- Playwright JS-rendering fallback is not implemented (static HTTP only).
- Email deliverability/mailbox verification is not performed (not claimed).
- Google city/state/ZIP parsing relies on Places Details address components.
- Bulk copy-to-profile is single-field/lead only (bulk deferred).
- Worker heartbeat is stored in Redis (PostgreSQL remains authoritative for jobs).

---

## Recommended Phase 5 tasks

- Add a search provider (Bing/SerpAPI) and an optional Playwright fallback for
  JS-heavy sites, behind the existing provider interface.
- Per-provider budgets/rate-limit configuration and richer usage dashboards.
- Bulk copy-to-profile and reviewer bulk actions.
- Dedicated worker-health persistence in PostgreSQL + alerting.
- (Later, per roadmap) AI segmentation/scoring on top of enriched signals.
