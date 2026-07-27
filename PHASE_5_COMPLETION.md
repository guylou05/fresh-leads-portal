# FreshBiz Leads — Phase 5 Completion Report

Phase 5 adds the **AI-assisted analysis layer**. AI analyzes official filing +
verified enrichment + approved manual data to produce recommendations
(classification, segmentation, hybrid lead score, service recommendations,
qualification, evidence-based reasoning, outreach angles, and reviewable drafts).
AI outputs are recommendations — never facts — are source-labeled, versioned,
and approval-gated. No CRM export, email/SMS sending, autonomous campaigns, or
billing (out of scope).

---

## Features completed

- Separate **AI queue + AI worker** (`npm run worker:ai`) reusing Redis/BullMQ;
  PostgreSQL-authoritative job state; idempotent per-lead jobs, retries + backoff,
  cancellation, heartbeat, graceful shutdown.
- OpenAI SDK (server-side) with a clearly-labeled deterministic **stub** fallback
  when no key is configured.
- Centralized, versioned prompts with prompt-injection defenses; strict Zod
  structured-output validation (ranges/enums/closed vocabularies) + repair retry.
- Source-labeled context builder + input fingerprint (idempotency + staleness).
- Classification (industry + business type), segmentation, **hybrid lead scoring**
  (deterministic sub-scores + AI-influenced fit/technology), service
  recommendations, qualification recommendation, outreach angles + drafts.
- Lead-detail AI tab, `/ai` dashboard, `/ai/new`, `/ai/jobs/[id]`, `/ai/review`,
  `/settings/ai`; AI leads filters; extended `/api/health/worker`.
- No invented facts/contact info; official/verified/manual data never overwritten;
  recommendations applied only on explicit confirmation.
- Cost + daily limits + ceiling; audit + lead-activity logging; error categories.

---

## Database changes

Migration `20260727044838_phase5_ai_analysis` adds enums (`AiAnalysisStatus`,
`AiDraftType`, `AiDraftStatus`, `AiJobType`, `AiJobStatus`) and models:
`AiAnalysis`, `AiOutreachDraft`, `AiJob`, `AiLeadJob`, `AiUsage`, and a single-row
`AiSettings`. Indexes cover businessRecordId, status, industry, segment,
leadScore, priority/qualification recommendation, promptVersion, model,
inputFingerprint, createdAt, and approvedAt.

---

## Routes created

- Pages: `/ai`, `/ai/new`, `/ai/jobs/[id]`, `/ai/review`, `/settings/ai`; AI tab
  on `/leads/[id]`.
- API: extended `/api/health/worker` (AI worker heartbeat + AI job stats).
- Server actions: create/cancel AI job, single-lead analyze, approve/reject
  analysis, mark stale, apply priority/qualification recommendation, edit/approve/
  reject/archive drafts, generate drafts, admin AI settings.
- Worker: `src/worker/ai-index.ts` → `ai-run.ts`.

---

## AI architecture

Parent `AiJob` + one `AiLeadJob` per record (persisted), enqueued to a dedicated
BullMQ queue with the unique lead-job id as the BullMQ job id. The AI worker runs
`processAiLeadJob`: build source-labeled context → `generateAnalysis` (OpenAI or
stub) → deterministic score with AI influence → persist `AiAnalysis` + `AiUsage`
→ optional drafts → update parent + lead activity. Redundant-run prevention is a
DB skip-fresh check (by input fingerprint); force refresh bypasses it.

---

## Prompt versions & models configured

- Prompt version: `v1` (stored on every `AiAnalysis` and draft).
- Models: `OPENAI_MODEL_CLASSIFICATION` / `OPENAI_MODEL_OUTREACH` (default
  `gpt-4o-mini`), overridable in `AiSettings`. Stub model id: `stub-v1`.

---

## Classification & segment taxonomy

Closed vocabularies (see `src/lib/ai/schemas.ts`): 26 primary industries, 12
business types, 14 sales segments, a 19-item VirtuoTech service catalog, 5
outreach tones, priority (LOW/NORMAL/HIGH/URGENT), qualification (QUALIFY/REVIEW/
DISQUALIFY/INSUFFICIENT_DATA), and 4 evidence source types.

---

## Scoring rules

Final 0–100 = geography (0–20) + business fit (0–20, AI-influenced) +
contactability (0–20) + technology opportunity (0–20, AI-influenced) +
freshness/timing (0–10) + confidence quality (0–10). Deterministic sub-scores
come from verified signals only; AI may only suggest the two influenced
sub-scores (clamped). Out-of-area and non-operational listings are capped.

---

## Approval workflow

Analyses are `NEEDS_REVIEW` when confidence is below the threshold, the segment
is "Needs Manual Review", qualification is `INSUFFICIENT_DATA`, or there are many
warnings. Users approve/reject analyses and apply priority/qualification
recommendations explicitly. Drafts are generated → editable (original preserved)
→ approve/reject/archive; never sent.

---

## Security protections

- **Prompt injection:** untrusted business data is fenced and the model is told
  to ignore embedded instructions, not reveal the system prompt/secrets, not
  change the schema, and not act on data content. Untrusted text is sanitized.
- **No invented contact info:** `findInventedContact` rejects emails/phones/URLs
  in drafts that don't appear in the known context.
- Secrets stay server-side; `OPENAI_API_KEY` is never returned to the browser;
  error categories never leak keys, stack traces, payloads, or DB/Redis details.

---

## Cost controls

Daily lead limit, per-job max batch size, and a cost ceiling (stops before
exceeding). Token usage + estimated cost tracked per call in `AiUsage`; job
totals on `AiJob`. Integer cents; pricing from `AI_INPUT/OUTPUT_COST_PER_MTOK_CENTS`
(0 = unknown → show token counts). Skip-fresh avoids redundant spend.

---

## Environment variables

`OPENAI_API_KEY`, `OPENAI_MODEL_CLASSIFICATION`, `OPENAI_MODEL_OUTREACH`,
`AI_WORKER_CONCURRENCY`, `AI_MAX_RETRIES`, `AI_REQUEST_TIMEOUT_MS`,
`AI_DAILY_LEAD_LIMIT`, `AI_DEFAULT_TEMPERATURE`, `AI_MAX_BATCH_SIZE`,
`AI_COST_CEILING_CENTS`, `AI_PROMPT_VERSION`, `AI_INPUT_COST_PER_MTOK_CENTS`,
`AI_OUTPUT_COST_PER_MTOK_CENTS`, `AI_ENABLED`. See `.env.example`.

---

## Railway deployment steps

Web · PostgreSQL · Redis · Enrichment worker · **AI worker** (same repo, start
`npm run worker:ai`). Give the AI worker the same DB/Redis/`AUTH_*` vars plus
`OPENAI_API_KEY` and `AI_*`. It has no HTTP port — disable its HTTP healthcheck;
monitor via `/api/health/worker`. Never expose `OPENAI_API_KEY` to the browser.
Deploy order: Postgres/Redis → Web (migrations) → Enrichment worker → AI worker.

---

## Commands executed

| Command | Result |
| --- | --- |
| `npm install openai` | OpenAI SDK added |
| `npm run db:migrate` (phase5) | Migration created + applied |
| `npx prisma migrate deploy` (clean DB) | All 5 migrations applied |
| `npm run lint` | No warnings/errors |
| `npm run typecheck` | No errors (web + both workers) |
| `npm test` | 202 passed (33 files, mocked/stub) |
| `npm run build` | Succeeded |
| `npm run worker` / `npm run worker:ai` | Both start, ready, heartbeat, shutdown |

---

## Test results

`npm test` → **202 passed** (33 files). Phase 5 additions: schema validation
(range/enum/service/segment/qualification rejection), context source labeling +
fingerprint stability/change, deterministic scoring (geography/contactability/
confidence/clamping/closed-listing cap), prompt-injection rules, stub output
validity + insufficient-data behavior, `findInventedContact`, freshness, and
cost estimation. OpenAI is never called live in tests.

**End-to-end (manual):** ran single-lead analysis (stub model) with source-labeled
evidence, sub-scored lead score, recommendations, and qualification; generated
four outreach drafts; edited + approved a draft; applied the priority
recommendation; approved the analysis; and confirmed the `/ai` dashboard (AI
worker online, stub mode, populated distributions + jobs).

---

## Known limitations

- Only OpenAI is wired among model providers; the client abstraction allows others.
- Without `OPENAI_API_KEY`, the labeled deterministic stub is used (heuristic
  mapping from evidence — not real inference).
- Manual overrides are implemented for priority/qualification (via apply actions)
  and industry (`customIndustry`); segment/service overrides are surfaced as
  recommendations only.
- AI segment/industry distributions live on `/ai` (the `/segments` page remains
  the Phase 3 saved-segments manager).
- Draft tone is fixed to "Consultative" in batch generation (per-draft tone
  selection is a future enhancement).

---

## Recommended Phase 6 tasks

- CRM-ready export of leads + approved AI fields + approved drafts.
- Per-draft tone selection and additional draft types (LinkedIn/SMS) in the UI.
- Bulk apply of AI recommendations (priority/tags) with confirmation counts.
- Real-provider pricing configuration + richer cost dashboards.
- Optional human-in-the-loop prompt/version management with strict validation.
