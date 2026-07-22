# AGENTS.md

## Cursor Cloud specific instructions

This is a Next.js 15 (App Router) + Prisma + PostgreSQL app. Standard commands
live in `package.json` and are documented in `README.md` / `PHASE_1_COMPLETION.md`;
prefer those. Notes below are the non-obvious bits for working in this repo.

### Services

- **Web app (Next.js):** `npm run dev` (http://localhost:3000). The only service.
- **PostgreSQL:** required. The dev VM has PostgreSQL 16 installed and running as
  a system service (`sudo pg_ctlcluster 16 main start` if it is not up after a
  reboot). Local credentials: user `postgres`, password `postgres`, database
  `freshbiz_leads`, on `localhost:5432`.

### First-run / setup gotchas

- The update script only installs deps (`npm install`, which also runs
  `prisma generate`). It does **not** create the DB, run migrations, or seed.
  On a fresh DB you must run: `npm run db:migrate` then `npm run db:seed`.
- A local `.env` is required (it is git-ignored). Copy `.env.example` to `.env`.
  Runtime-critical vars: `DATABASE_URL`, `AUTH_SECRET` (>=16 chars), `AUTH_URL`.
  Seed vars: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (>=10 chars).
  `src/env.ts` throws a clear error at startup if a runtime var is missing.
- Seeded local admin (from `.env` defaults): `admin@freshbiz.local` /
  `ChangeMe123!`. Re-running `npm run db:seed` is safe (no-op if admin exists);
  use `npm run db:seed:reset-admin` to reset name/password.

### Testing / quality gates

- `npm test` (Vitest) runs pure-logic unit tests and does **not** need the DB.
- `npm run lint`, `npm run typecheck`, and `npm run build` should all pass.
- `npm run build` runs `prisma generate` first; it needs `DATABASE_URL` present
  (Prisma reads it) but does not need the DB to be reachable to compile.

### Auth architecture notes (non-obvious)

- Auth.js config is split: `src/auth.config.ts` is edge-safe (used by
  `src/middleware.ts` for route protection, NO Prisma/bcrypt), while `src/auth.ts`
  adds the Credentials provider (Prisma + bcrypt) for the Node runtime. Keep
  database/bcrypt imports out of `auth.config.ts` or middleware will break.
- Sessions are JWT (required for the Credentials provider). Route protection is
  enforced both in middleware and again in `src/app/(app)/layout.tsx`.
- bcrypt is `bcryptjs` (pure JS) on purpose — avoids native build issues.
