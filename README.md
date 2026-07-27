# FreshBiz Leads

**AI-assisted business lead discovery and enrichment.**

FreshBiz Leads is an internal lead-generation portal. In future phases it will
import newly registered business records from Ohio Secretary of State TXT/CSV
reports, enrich them with public contact data, segment them with AI, score them,
and export CRM-ready contact lists.

This repository currently contains the **Phase 1 foundation**: a secure,
production-ready Next.js application shell with authentication, a dashboard,
account settings, admin user management, health checks, and Railway deployment
configuration. Import / enrichment / AI / scraping / export features are **not**
built yet.

---

## Technology stack

| Concern         | Choice                                             |
| --------------- | -------------------------------------------------- |
| Framework       | Next.js 15 (App Router, React 19, Server Components)|
| Language        | TypeScript (strict mode)                            |
| Styling         | Tailwind CSS                                        |
| Database        | PostgreSQL                                          |
| ORM             | Prisma                                              |
| Auth            | Auth.js / NextAuth v5 (Credentials provider, JWT)  |
| Validation      | Zod                                                 |
| Password hashing| bcrypt (via `bcryptjs`)                             |
| Testing         | Vitest                                              |
| Linting/format  | ESLint + Prettier                                   |
| Deployment      | Railway (from GitHub)                               |

> **Note on bcrypt:** we use `bcryptjs`, a pure-JS implementation of the bcrypt
> algorithm. It is a drop-in replacement that avoids native build steps, which
> keeps builds reliable on Railway and other managed platforms.

---

## Local installation

### Prerequisites

- Node.js 20+
- A running PostgreSQL 14+ instance

### Steps

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Create your local environment file
cp .env.example .env
# then edit .env with your values (see below)

# 3. Apply database migrations
npm run db:migrate

# 4. Seed the first administrator
npm run db:seed

# 5. Start the dev server
npm run dev
```

Visit http://localhost:3000 and sign in with the `ADMIN_EMAIL` /
`ADMIN_PASSWORD` you set in `.env`.

---

## Environment variables

All variables are validated centrally in `src/env.ts` (runtime) and
`prisma/seed.ts` (seed). The app fails fast with a clear message if a
runtime-critical variable is missing.

| Variable          | Required        | Description                                            |
| ----------------- | --------------- | ------------------------------------------------------ |
| `DATABASE_URL`    | Yes (runtime)   | PostgreSQL connection string.                          |
| `AUTH_SECRET`     | Yes (runtime)   | Secret used to sign sessions (`openssl rand -base64 32`).|
| `AUTH_URL`        | Yes (runtime)   | Canonical app URL (e.g. `http://localhost:3000`).      |
| `AUTH_TRUST_HOST` | Recommended     | Set `true` behind a proxy (Railway).                   |
| `ADMIN_NAME`      | Yes (seed)      | Name of the seeded administrator.                      |
| `ADMIN_EMAIL`     | Yes (seed)      | Email of the seeded administrator.                     |
| `ADMIN_PASSWORD`  | Yes (seed)      | Password for the seeded admin (min 10 chars).          |
| `MAX_IMPORT_FILE_SIZE_MB` | No (default 20) | Max size of an uploaded import file, in MB.    |

The `ADMIN_*` variables are only consumed by the seed script, so a running
container does not crash if they are absent — but they must be present when you
run the seed.

**Never commit real secrets.** `.env` is git-ignored; `.env.example` documents
the shape.

---

## PostgreSQL setup

Local (Docker) example:

```bash
docker run --name freshbiz-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=freshbiz_leads -p 5432:5432 -d postgres:16
```

Then set:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/freshbiz_leads?schema=public"
```

---

## Prisma migrations

```bash
# Local: create + apply a new migration during development
npm run db:migrate            # prisma migrate dev

# Production: apply committed migrations (no schema drift, no prompts)
npm run db:migrate:deploy     # prisma migrate deploy

# Regenerate the Prisma client (also runs automatically on install/build)
npm run db:generate

# Inspect data
npm run db:studio
```

We use proper migrations (not `db push`) so production schema changes are
reviewable and repeatable.

---

## Seed command

```bash
# Create the admin if it does not already exist (safe to run repeatedly)
npm run db:seed

# Explicitly reset an existing admin's name + password
npm run db:seed:reset-admin
```

The seed never logs the plain-text password and validates password strength.

---

## Running tests

```bash
npm test          # run the Vitest suite once
npm run test:watch

npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm run build     # production build
```

---

## Railway deployment

FreshBiz Leads deploys to Railway directly from GitHub.

1. **Create the project & database**
   - New Project → Deploy from GitHub repo → select this repository.
   - Add a **PostgreSQL** plugin/service to the project.

2. **Connect the database**
   - In your web service's **Variables**, set
     `DATABASE_URL` to the Postgres service's connection string. Railway exposes
     it as `${{Postgres.DATABASE_URL}}` — reference it directly.

3. **Set environment variables** (web service → Variables):
   - `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` (your Railway public URL),
     `AUTH_TRUST_HOST=true`, and `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`
     for the first seed.

4. **Build & start** (configured in `railway.json`):
   - Build: `npm run build` (runs `prisma generate` + `next build`).
   - Start: `npm run db:migrate:deploy && npm run start` (applies migrations,
     then boots Next.js). The app binds to Railway's `PORT` automatically — no
     hard-coded port.
   - Health check path: `/api/health`.

5. **Deploy from `main`**
   - Pushes to `main` trigger a build + deploy. On first deploy, run the seed
     once (Railway one-off command or a shell): `npm run db:seed`.

---

## Project structure

```
prisma/
  schema.prisma          # User + AuditLog models, enums
  migrations/            # committed SQL migrations
  seed.ts                # first-admin seed
src/
  env.ts                 # typed, validated environment
  auth.config.ts         # edge-safe Auth.js config (route protection)
  auth.ts                # Auth.js with Credentials provider (Prisma + bcrypt)
  middleware.ts          # route protection
  lib/                   # prisma, password, authz, audit, rate-limit, utils
  components/            # UI primitives, layout, auth + settings forms
  app/
    login/               # public login (+ server action)
    forgot-password/     # public placeholder
    privacy/ terms/      # public placeholders
    (app)/               # authenticated area (sidebar + topbar shell)
      dashboard/
      imports/ leads/ enrichment/ segments/ exports/  # placeholders
      settings/          # profile + password
        users/           # admin-only user management
    api/health/          # liveness + database readiness
tests/                   # Vitest suites
```

---

## Current Phase 1 features

- Secure credentials authentication (bcrypt hashes, JWT sessions, protected routes)
- Role-based access (`ADMIN` / `USER`) and account status (`ACTIVE` / `DISABLED`)
- Professional dashboard shell: collapsible sidebar, top bar, stat cards,
  quick-start checklist, recent activity (audit log), system status, empty states
- Account settings: profile update + secure password change
- Admin user management: create users, change roles, disable/reactivate,
  reset passwords — with last-active-admin and self-disable protections
- Audit logging of sensitive actions
- Health-check endpoints (`/api/health`, `/api/health/database`)
- Centralized, typed environment validation
- Error boundaries, not-found page, toasts, consistent API errors
- Basic login rate limiting
- Railway deployment configuration
- Vitest tests + ESLint + Prettier

## Current Phase 2 features — business report imports

- Upload Ohio Secretary of State reports (`.txt` / `.csv`) with progress and a
  preview-then-confirm workflow (`/imports`, `/imports/new`, `/imports/[id]`).
- Streaming CSV parsing (`csv-parse`): UTF-8 BOM stripping, Windows CRLF, quoted
  fields with embedded commas, empty columns, ragged-row flagging.
- Case-insensitive header detection + canonical column mapping (shown before import).
- Report-type detection (Domestic LLC, Nonprofit, For-Profit, Foreign, …) with
  manual correction.
- Server-side normalization (business names, states, ZIP-as-string, dates, addresses).
- Deterministic deduplication with a stable `sourceRecordHash`; rows classified
  NEW / EXACT_DUPLICATE / POSSIBLE_DUPLICATE / INVALID.
- Batched, transaction-safe import with a DB unique guard against concurrent dupes.
- Import history, per-import summary metrics, row-error reporting, and an
  invalid-rows CSV download.
- Server-side paginated/filtered/sorted Leads browsing (`/leads`, `/leads/[id]`).
- Audit logging for every import stage; admin-only deletion of failed/cancelled batches.

### Supported file formats

`.txt` and `.csv`. Ohio `.TXT` reports are comma-delimited CSV despite the
extension and are fully supported. Max size is configurable via
`MAX_IMPORT_FILE_SIZE_MB` (default 20).

### Expected Ohio headers

`DOCUMENT NUMBER`, `CHARTER NUMBER`, `EFFECTIVE DATE`, **`BUSINESS NAME`** (required),
`CONSENT FLAG`, `TRANSACTION CODE DESCRIPTION`, `FILING ADDRESS NAME`,
`FILING ADDRESS 1/2`, `FILING CITY/STATE/ZIP`, `AGENT ADDRESS NAME`,
`AGENT ADDRESS 1/2`, `AGENT CITY/STATE/ZIP`, `BUSINESS CITY`, `COUNTY`,
`BUSINESS ASSOCIATE NAMES`. Header spacing/case variations (e.g. `Business Name`,
`business_name`, `BUSINESSNAME`) are auto-mapped; unknown columns are ignored.

### Import workflow

1. Upload a report on `/imports/new` (validated: extension, MIME, non-binary, size).
2. The file is checksummed (SHA-256) and processed in a temp directory.
3. Header is parsed, columns mapped, report type detected, first 25 valid rows
   previewed, and duplicates estimated.
4. Review the mapping/preview on `/imports/[id]`, optionally correct the report
   type, choose whether to include possible duplicates, then confirm.
5. Records import in batches; progress is polled; a summary + row errors appear.

### Duplicate rules (priority order)

1. Same source + document number → EXACT
2. Same source + charter number + effective date → EXACT
3. Same `sourceRecordHash` → EXACT
4. Normalized name + effective date + business city → POSSIBLE
5. Normalized name + charter number → POSSIBLE

Exact duplicates are always skipped; possible duplicates are skipped by default
(the user may opt to include them).

### File size configuration

Set `MAX_IMPORT_FILE_SIZE_MB` (default `20`). Enforced client- and server-side.

## Migrations (Phase 2)

```bash
npm run db:migrate          # local: create/apply during development
npm run db:migrate:deploy   # production: apply committed migrations
```

The Phase 2 migration adds `import_batches`, `business_records`, and
`import_row_errors`. `npx prisma migrate deploy` is verified against a clean
PostgreSQL database.

## Railway notes (imports)

- Uploads are processed in the OS temp directory (`os.tmpdir()`), never inside
  the repo, and are cleaned up after import/cancel/delete. Do not rely on a
  persistent local disk — a redeploy between upload and confirm invalidates a
  temp file, and the import fails safely (re-upload).
- Imports run in-process on the persistent Node server (no worker/Redis yet); the
  service is structured (parser / headers / normalization / validation /
  deduplication / persistence) so it can move to a BullMQ worker later without
  rewriting that logic.
- Configure `MAX_IMPORT_FILE_SIZE_MB` per your Railway memory limits.

## Troubleshooting

- **"Could not find a required 'Business Name' column"** — the header row lacks a
  recognizable business-name column; check the file's first line.
- **Import stuck in `IMPORTING`** — the server likely restarted mid-import
  (temp file lost). Delete the failed/cancelled batch (admin) and re-upload.
- **Rows marked INVALID** — download the invalid-rows CSV from the import details
  page to see per-row error codes/messages (e.g. `BUSINESS_NAME_REQUIRED`).
- **Unexpected duplicates skipped** — review the duplicate rules above; exact
  matches (document/charter+date/hash) are always skipped.

## Current Phase 3 features — lead management workflow

Turns imported businesses into manageable sales leads. **Official filing data
(`BusinessRecord`) stays immutable**; all sales data lives in separate models. A
`LeadProfile` is created lazily on the first sales action.

### Lead workflow

- **Statuses:** NEW, REVIEWING, QUALIFIED, CONTACT_READY, CONTACTED, FOLLOW_UP,
  INTERESTED, PROPOSAL, WON, LOST, DISQUALIFIED, ARCHIVED. Records with no profile
  default to NEW.
- **Priorities:** LOW, NORMAL, HIGH, URGENT (default NORMAL).
- Editable sales fields: assignee, primary contact/title/email/phone, website,
  custom industry, estimated value (stored as integer cents), follow-up date,
  last-contacted date, internal summary.
- Every change records a `LeadActivity` (user-facing history) and, for
  security-relevant changes, an `AuditLog` entry.

### Assignment behavior

Leads have at most one assignee, who must be an **active** user. Disabled users
remain visible in historical activity but cannot receive new assignments.
Reassignment and unassignment are recorded in activity.

### Notes and tags

- **Notes:** add / edit / delete / pin. Authors and ADMINs may edit or delete a
  note; deletion requires confirmation. Line breaks preserved; length-limited.
- **Tags:** ADMINs manage the catalog (create, rename, recolor, delete, merge)
  using an **approved color palette** (no arbitrary CSS). All users apply/remove
  tags. In-use tags cannot be deleted without confirming removal from all leads.
  Manage at `/settings/tags`.

### Follow-up workflow

Set a follow-up date/time (shown in UTC). The dashboard and `/leads/follow-ups`
surface **overdue**, **due today**, and **next 7 days**. Moving a lead to WON,
LOST, DISQUALIFIED, or ARCHIVED prompts whether to clear an existing follow-up
(never cleared without confirmation).

### Qualification & disqualification

Qualify sets status QUALIFIED + `qualifiedAt`. Disqualify **requires a reason**
(preset list or "Other" with explanation), sets status DISQUALIFIED +
`disqualifiedAt`, and can later be restored to REVIEWING.

### Saved segments

Save the current lead filters as a segment (`/segments`). Segments are **PRIVATE**
(owner-managed) or **SHARED** (ADMIN-managed, visible to all). Apply, rename,
duplicate, or delete. Stored filters are whitelisted, so saved JSON can never
drive arbitrary queries.

### Bulk actions

Select leads on the current page and change status/priority, assign/unassign,
add/remove a tag, set/clear follow-up, qualify, disqualify, or archive/restore.
Bulk actions run transactionally, are permission-checked server-side, show the
affected count, require confirmation for archive/disqualify, and never update
more records than were confirmed. No destructive deletion.

### Permissions

ADMIN and USER can view leads, edit workflow fields, add notes, apply/remove
tags, set follow-ups, assign leads, and create private segments. ADMIN only:
manage the tag catalog, create/manage shared segments, and edit/delete any note.
All enforced server-side.

### Archiving

Archiving never deletes. Archived leads keep their notes/activity, are hidden
from default views, remain searchable via the "Archived only"/"Include archived"
filter, and can be restored.

## Migrations (Phase 3)

The Phase 3 migration adds `lead_profiles`, `tags`, `lead_tags`, `lead_notes`,
`lead_activities`, and `saved_segments`. Apply with `npm run db:migrate` (local)
or `npm run db:migrate:deploy` (production); verified against a clean database.

## Railway deployment notes (Phase 3)

All lead state is stored in PostgreSQL — no local disk, no Redis, no hard-coded
ports. Bulk updates run synchronously in transactions and are sized for typical
selections. Standard deployment (build + `prisma migrate deploy` + start) is
unchanged from earlier phases.

## Current Phase 4 features — external business-enrichment engine

Asynchronously enrich leads with **public** business information. Enriched data
is stored separately from official filing data and manual sales data; every
field carries source attribution + confidence, and the system never invents
contact information (unknown values stay blank).

### Enrichment architecture

- **Web service** creates jobs; **Redis + BullMQ** queue; a **separate worker
  process** (`npm run worker`) consumes jobs. **PostgreSQL is the source of
  truth** for job/lead state (Redis is transient). Long-running work never runs
  inside a page request.
- Deployment model: Web service · PostgreSQL · Redis · Worker service (same repo,
  different start command).

### Provider abstraction

Providers return structured results (`field`, `value`, `normalizedValue`,
`source`, `sourceUrl`, `confidence`, `matchReason`, `metadata`, `retrievedAt`)
and **never** write to the database — the orchestration service evaluates and
persists them. Implemented: `GooglePlacesProvider`, `WebsiteDiscoveryProvider`,
`WebsiteCrawlerProvider`, `ContactExtractionProvider`, `SocialLinkProvider`.
The interface supports adding Bing/SerpAPI/Hunter/Clearbit/etc. later.

### Google Places setup

Set `GOOGLE_MAPS_API_KEY` (server-side only; never exposed to the browser).
Without it, Google matching is skipped and other providers still run. Candidates
are **scored** (name/city/ZIP/state/address/website/phone agreement, with
penalties for different state, non-operational, generic address) and classified
`HIGH/MEDIUM/LOW/NO_MATCH/MULTIPLE_POSSIBLE_MATCHES` — the first result is never
auto-selected, and rating/review count are not used as match proof.

### Redis + BullMQ setup

Set `REDIS_URL`. Locally: `redis-server` then `npm run worker` (or `worker:dev`).
Concurrency, retries, and timeouts come from env (`ENRICHMENT_WORKER_CONCURRENCY`,
`ENRICHMENT_MAX_RETRIES`, `ENRICHMENT_REQUEST_TIMEOUT_MS`). Retries use
exponential backoff; jobs are idempotent (stable per-lead key); force-refresh is
explicit.

### Website crawl rules

Static HTTP (Cheerio) only, homepage + contact/about/team/locations, honoring
robots.txt (best effort), a configured user agent, and limits for pages
(`WEBSITE_CRAWL_MAX_PAGES`), bytes (`WEBSITE_CRAWL_MAX_BYTES`), delay, timeout,
and redirects. No login, CAPTCHA-solving, or private-dashboard crawling.

### Confidence model & source attribution

Field-level and overall confidence (0–100) with a short explanation (e.g.
"Website verified, but no public email found", "Multiple possible Google
listings require review", "Phone conflicts between Google and website"). Each
enriched field shows value, confidence, provider, source URL (when safe),
retrieved date, match explanation, and a manual/automated label. Raw provider
payloads are never exposed.

### Manual review & overrides

Low-confidence, conflicting, or multiple-match results are flagged for
`/enrichment/review`. Reviewers can accept, retry, clear, or enter a manual
correction. Manual overrides are labeled and are **not** overwritten by future
automated runs unless a force refresh is chosen. Enrichment never writes to the
manual `LeadProfile`; values are moved only via explicit "copy to lead profile".

### Cache rules

Google/website verification cached ~`ENRICHMENT_DEFAULT_CACHE_DAYS` (30) days;
fresh cached leads are skipped unless force-refreshed; results become `STALE`
after expiry. Historical source records are retained even when the latest result
changes (clearing a lead's enrichment deletes its raw data by design).

### Cost controls

Daily per-app lead limit, per-job cap, cost ceiling, request deduplication via
caching, and usage tracking. Costs are stored in **integer cents** and Google
pricing is **not hard-coded** — it comes from `GOOGLE_PLACES_COST_PER_CALL_CENTS`
(when 0/unknown, the UI shows request counts instead of a false estimate).

### Security controls / SSRF protection

All outbound URL fetching is SSRF-guarded: http(s) only (blocks
`file:`/`ftp:`/`data:`/`javascript:`/`gopher:` and embedded credentials), blocks
localhost/private/link-local/multicast/**cloud-metadata** addresses, re-resolves
and re-validates DNS on **every redirect hop** (DNS-rebinding safe), and enforces
redirect/size/timeout/content-type limits. Extracted content is only rendered as
sanitized text.

## Railway web + worker deployment

Create four services in one project: **Web**, **PostgreSQL**, **Redis**, and a
**Worker** (same GitHub repo, start command `npm run worker`).

1. Add PostgreSQL and Redis plugins.
2. **Web service variables:** `DATABASE_URL` (`${{Postgres.DATABASE_URL}}`),
   `REDIS_URL` (`${{Redis.REDIS_URL}}`), `AUTH_SECRET`, `AUTH_URL`,
   `AUTH_TRUST_HOST=true`, `GOOGLE_MAPS_API_KEY`, and the enrichment/crawl tuning
   vars. Build `npm run build`; start `npm run db:migrate:deploy && npm run start`;
   healthcheck `/api/health`.
3. **Worker service variables:** the same `DATABASE_URL`, `REDIS_URL`,
   `GOOGLE_MAPS_API_KEY`, and tuning vars, **plus `AUTH_SECRET` and `AUTH_URL`**
   (the shared env validation requires them even though the worker doesn't use
   auth). The worker must run `npm run worker` — **not** the web start command.
   Because the root `railway.json` hard-codes the web start command for every
   service that uses it, point the Worker service at the dedicated
   **`railway.worker.json`** config file (Railway service → Settings →
   Config-as-code / "Railway Config File" path). That file sets
   `startCommand: npm run worker` and defines **no** healthcheck, so Railway
   won't run an HTTP healthcheck against the (HTTP-less) worker. Monitor it via
   process status + the Redis heartbeat (surfaced at `/api/health/worker`).
4. **Deployment order:** provision Postgres + Redis → deploy Web (runs
   migrations) → deploy Worker. Reference variables via `${{Service.VAR}}`; do
   not hard-code service names. Never expose `GOOGLE_MAPS_API_KEY` to client JS.
5. **Verify queue processing:** create a single-lead job, watch the worker logs
   and `/enrichment` (worker online, job completes). **Restart failed jobs** via
   Retry on `/enrichment/review` or a lead's Enrichment tab.

## Troubleshooting (enrichment)

- **Worker offline on `/enrichment`** — ensure the worker process is running and
  `REDIS_URL` matches the web service; check `/api/health/worker`.
- **Google matches missing** — `GOOGLE_MAPS_API_KEY` not set/invalid (shows as
  "Not configured"); other providers still run.
- **Everything "needs review"** — expected when only low-confidence evidence is
  found; use the review queue to accept/correct/clear.
- **Website blocked/timeout** — the crawler enforces SSRF + size/time limits;
  private, parked, directory, and social-only sites are rejected as websites.

## Planned future phases

- **Phase 5:** AI segmentation + lead scoring.
- **Phase 6:** CRM-ready exports.

See `PHASE_1_COMPLETION.md`, `PHASE_2_COMPLETION.md`, `PHASE_3_COMPLETION.md`, and
`PHASE_4_COMPLETION.md` for detailed phase reports.
