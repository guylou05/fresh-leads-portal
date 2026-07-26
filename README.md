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

## Planned future phases

- **Phase 3:** Enrichment with public contact data.
- **Phase 4:** AI segmentation + lead scoring.
- **Phase 5:** CRM-ready exports.

See `PHASE_1_COMPLETION.md` and `PHASE_2_COMPLETION.md` for detailed phase reports.
