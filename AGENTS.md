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

### Import system notes (Phase 2, non-obvious)

- Import logic lives in `src/lib/imports/*` (parser/headers/normalization/
  validation/deduplication/service) and is deliberately UI-agnostic so it can
  later move to a background worker. Keep it framework-free.
- File **upload** uses a Route Handler (`POST /api/imports/upload`), not a server
  action, so large files + XHR progress work (server actions cap body size).
  Start/cancel/delete are server actions.
- Imports run **in-process** and fire-and-forget after `startImport` (no Redis).
  This only works because Railway/dev is a persistent Node server — do not assume
  a serverless model. The details page polls `/api/imports/[id]/status`.
- Uploads are processed in `os.tmpdir()/freshbiz-imports` and cleaned up after
  import/cancel/delete. Never store uploads in the repo. A server restart between
  upload (READY) and confirm loses the temp file; the import then fails safely.
- Dedupe safety net: `BusinessRecord` has `@@unique([source, sourceRecordHash])`;
  inserts use `createMany({ skipDuplicates: true })`. If you change the hash
  inputs in `deduplication.ts`, existing rows keep their stored hash.
- `npm test` still needs no DB (pure-logic tests); the full pipeline is covered
  by `tests/imports/fixture-integration.test.ts` using `tests/fixtures/ohio-sample.txt`.
