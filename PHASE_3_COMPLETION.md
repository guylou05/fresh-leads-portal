# FreshBiz Leads — Phase 3 Completion Report

Phase 3 delivers the **lead-management workflow** used after businesses are
imported. Official filing data (`BusinessRecord`) remains immutable; all
user-entered sales data lives in new models. External enrichment, Google Places,
website scraping, OpenAI/AI scoring, automated email, and CRM export are
intentionally **out of scope**.

---

## Features completed

- **Lazy `LeadProfile`**: created on the first sales action (status/priority/
  assign/note/tag/follow-up/contact edit). Records without a profile take the
  default effective state (NEW / NORMAL / unassigned / not archived).
- **Workflow editing**: status, priority, assignee, primary contact fields,
  email, phone, website, custom industry, estimated value (integer cents),
  follow-up + last-contacted dates, internal summary.
- **Notes**: add / edit / delete / pin, author-or-admin permissions, confirm on
  delete, line breaks preserved, length-limited.
- **Tags**: admin-managed catalog (create/rename/recolor/delete/merge) with an
  approved color palette; all users apply/remove; in-use tags protected from
  deletion; `/settings/tags`.
- **Assignment**: single active-user assignee; disabled users can't receive new
  assignments but remain in history; activity recorded.
- **Follow-ups**: set/clear with UTC display; `/leads/follow-ups` (overdue / due
  today / upcoming); status transitions to WON/LOST/DISQUALIFIED/ARCHIVED prompt
  to clear follow-up (never without confirmation).
- **Qualification / disqualification**: qualify sets QUALIFIED + `qualifiedAt`;
  disqualify requires a reason (+ "Other"), sets DISQUALIFIED + `disqualifiedAt`;
  restorable.
- **Saved segments**: PRIVATE/SHARED, apply/rename/duplicate/delete, whitelisted
  filters; `/segments`, `/segments/[id]`.
- **Bulk actions**: status/priority/assign/unassign/add-remove tag/set-clear
  follow-up/qualify/disqualify/archive/restore — transactional, permission-
  checked, confirmation-count enforced, confirm required for destructive actions.
- **Leads table**: server-side filters, sorting, pagination (25/50/100), bulk
  selection, row action menu, per-user column visibility (localStorage).
- **Lead detail**: tabs — Overview (editable workflow + tags), Notes, Activity
  (chronological, no raw metadata), Filing data (read-only official filing).
- **Dashboard**: real metrics (total businesses, active/new/qualified/contact-
  ready/high-priority/unassigned leads, follow-ups due/overdue, recently updated)
  + quick links.
- Archiving never deletes; archived leads are hidden by default, searchable, and
  restorable. Preserves all Phase 1/2 functionality.

---

## Database changes

Migration `20260727001711_phase3_lead_management` adds:

- Enums: `LeadStatus`, `LeadPriority`, `LeadActivityType`, `SegmentVisibility`.
- `lead_profiles` (`LeadProfile`) — 1:1 with `BusinessRecord` (`businessRecordId`
  unique), workflow fields, `estimatedValueCents Int?`, `archivedAt` +
  `preArchiveStatus`, `createdById`/`updatedById`. Indexes: status, priority,
  assignedToId, followUpAt, lastContactedAt, createdAt, updatedAt, primaryEmail,
  primaryPhone, website.
- `tags` (`Tag`) — `normalizedName` unique (case-insensitive uniqueness).
- `lead_tags` (`LeadTag`) — composite unique `(leadProfileId, tagId)`.
- `lead_notes` (`LeadNote`), `lead_activities` (`LeadActivity`),
  `saved_segments` (`SavedSegment`, JSON `filters`).

`BusinessRecord` was not modified (only a back-relation added). No existing
imported data changes.

---

## Routes created

- Pages: `/leads` (rewritten), `/leads/[id]` (rewritten, tabbed),
  `/leads/follow-ups`, `/segments`, `/segments/[id]`, `/settings/tags`.
- Server actions: `src/app/(app)/leads/actions.ts` (workflow + notes + tags),
  `src/app/(app)/leads/bulk.ts`, `src/app/(app)/settings/tags/actions.ts`,
  `src/app/(app)/segments/actions.ts`.

---

## Lead workflow rules

- Effective state without a profile: NEW / NORMAL / unassigned / not archived.
- Every mutation records a `LeadActivity`; security-relevant ones also record an
  `AuditLog` (note bodies are not stored in audit metadata).
- Disqualification requires a reason. Follow-up clearing on terminal statuses is
  confirmed, never automatic.

---

## Permission rules

- **ADMIN + USER**: view leads, edit workflow fields, add notes, apply/remove
  tags, set follow-ups, assign leads, create private segments, run standard bulk
  actions.
- **ADMIN only**: manage the tag catalog, create/manage shared segments, edit or
  delete any note.
- Note authors may edit/delete their own notes. Enforced server-side in every
  action (not just hidden UI).

---

## Bulk action behavior

Operates on explicitly selected record IDs. The server asserts the id count
equals the confirmed count (`assertConfirmationCount`) so it never updates more
than shown; archive/disqualify require `confirmed: true`. All updates + activity
entries run in a single transaction; one `AuditLog` (`lead.bulk`) records the
action and count. No deletion.

---

## Segment behavior

PRIVATE segments are managed by their owner; SHARED segments are visible to all
and managed by admins (admins cannot manage others' private segments). Filters
are whitelisted via `sanitizeFilters` before storage and before building any
query, so obsolete/unsupported keys are ignored safely.

---

## Environment variables

No new variables in Phase 3 (reuses Phase 1/2 configuration).

---

## Commands executed

| Command | Result |
| --- | --- |
| `npm run db:migrate` (phase3) | Migration created + applied |
| `npx prisma migrate deploy` (clean DB) | All 3 migrations applied |
| `npm run lint` | No warnings/errors |
| `npm run typecheck` | No errors |
| `npm test` | 135 passed (22 files) |
| `npm run build` | Succeeded (25 routes) |

---

## Test results

`npm test` → **135 passed** (22 files). Phase 3 additions:

- `leads/validation.test.ts` — email/website/phone normalization, estimated-value
  cents storage, follow-up date parsing.
- `leads/permissions.test.ts` — tag/note/assignment/segment permissions,
  disabled-user assignment rejection.
- `leads/query.test.ts` — filter whitelisting, `buildLeadWhere` (default state,
  archive exclusion, unassigned, presence filters, tags), sorting, pagination.
- `leads/bulk.test.ts` — confirmation-count guard, destructive confirmation,
  schema validation.
- `leads/profile.test.ts` — default effective state + lazy profile creation
  (records PROFILE_CREATED).
- `leads/tags.test.ts` — case-insensitive uniqueness basis, palette-only colors.
- `leads/segments.test.ts` — filter validation, segment input schema.

Existing final-active-admin protection tests remain green (unaffected).

**End-to-end (manual):** created a tag; on a lead — changed status/priority,
assigned, saved contact + estimated value, added a tag, added + pinned a note,
verified the Activity history (incl. lazy "Lead profile created") and read-only
Filing tab; bulk-set priority for all leads; saved a "High priority leads"
segment; archived then restored a lead; and confirmed live dashboard metrics.

---

## Known limitations

- Multi-tag filtering matches **any** of the selected tags (not all).
- Bulk actions operate on the current page's selection (no cross-page
  "select all matching"); capped at 500 per action.
- Follow-up times are handled/displayed in **UTC** (no per-user timezone yet).
- Column visibility preferences persist per browser (localStorage), not per
  server-side user profile.
- Bulk updates run synchronously; very large multi-thousand-record operations
  would benefit from a background worker (deferred, no Redis in this phase).

---

## Recommended Phase 4 tasks

- Enrichment model + pipeline (public contact data) keyed to `LeadProfile`, with
  provenance and confidence — surfaced separately from official filing data.
- Per-user timezone handling for follow-ups and activity timestamps.
- Server-persisted column/view preferences and cross-page "select all matching".
- A background worker (BullMQ/Redis) for very large bulk operations and future
  enrichment jobs.
- Saved-segment-driven dashboards and "all tags" multi-tag filtering.
