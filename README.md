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

## Planned future phases

- **Phase 2:** Import Ohio Secretary of State TXT/CSV reports (parse, de-dupe).
- **Phase 3:** Enrichment with public contact data.
- **Phase 4:** AI segmentation + lead scoring.
- **Phase 5:** CRM-ready exports.

See `PHASE_1_COMPLETION.md` for the detailed Phase 1 report.
