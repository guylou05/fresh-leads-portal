import type { LeadPriority, LeadStatus, Prisma } from "@prisma/client";
import {
  DEFAULT_PAGE_SIZE,
  LEAD_PRIORITY_VALUES,
  LEAD_STATUS_VALUES,
  PAGE_SIZE_OPTIONS,
} from "@/lib/leads/constants";
import { normalizePhone } from "@/lib/leads/validation";

/** All supported, whitelisted lead filter keys (also used to validate segments). */
export const FILTER_KEYS = [
  "q",
  "status",
  "priority",
  "assignedTo",
  "unassigned",
  "tags",
  "county",
  "city",
  "entityType",
  "source",
  "importBatchId",
  "from",
  "to",
  "hasEmail",
  "hasPhone",
  "hasWebsite",
  "followUp",
  "followUpFrom",
  "followUpTo",
  "recentlyUpdated",
  "qualified",
  "disqualified",
  "archived",
  "sort",
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];

export type LeadFilters = Partial<Record<FilterKey, string>>;

export const SORT_OPTIONS = [
  "effective_desc",
  "effective_asc",
  "name_asc",
  "imported_desc",
  "updated_desc",
  "followup_asc",
  "priority_desc",
  "status_asc",
  "county_asc",
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Parse and whitelist raw search params into typed lead filters. */
export function parseLeadFilters(
  sp: Record<string, string | string[] | undefined>,
): LeadFilters {
  const filters: LeadFilters = {};
  for (const key of FILTER_KEYS) {
    const value = one(sp[key]).trim();
    if (value) filters[key] = value;
  }
  return filters;
}

/** Validate a stored segment filter object, dropping unsupported keys safely. */
export function sanitizeFilters(input: unknown): LeadFilters {
  if (!input || typeof input !== "object") return {};
  const record = input as Record<string, unknown>;
  const filters: LeadFilters = {};
  for (const key of FILTER_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      filters[key] = value.trim();
    }
  }
  return filters;
}

function parseDate(value: string, endOfDay = false): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined;
  const iso = value.length <= 10 ? `${value.slice(0, 10)}T${endOfDay ? "23:59:59" : "00:00:00"}Z` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function startOfToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Build a Prisma where clause from lead filters. Uses an AND array so multiple
 * profile-scoped conditions don't collide. Records without a LeadProfile take
 * the default effective state (NEW / NORMAL / unassigned / not archived).
 */
export function buildLeadWhere(
  filters: LeadFilters,
  now: Date = new Date(),
): Prisma.BusinessRecordWhereInput {
  const and: Prisma.BusinessRecordWhereInput[] = [];

  if (filters.q) {
    const q = filters.q;
    const phone = normalizePhone(q) ?? q;
    and.push({
      OR: [
        { businessName: { contains: q, mode: "insensitive" } },
        { charterNumber: { contains: q, mode: "insensitive" } },
        { documentNumber: { contains: q, mode: "insensitive" } },
        {
          leadProfile: {
            OR: [
              { primaryContactName: { contains: q, mode: "insensitive" } },
              { primaryEmail: { contains: q.toLowerCase() } },
              { primaryPhone: { contains: q } },
              { primaryPhoneNormalized: { contains: phone } },
              { website: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  if (filters.county)
    and.push({ county: { contains: filters.county, mode: "insensitive" } });
  if (filters.city)
    and.push({ businessCity: { contains: filters.city, mode: "insensitive" } });
  if (filters.entityType) and.push({ entityType: filters.entityType });
  if (filters.source) and.push({ source: filters.source });
  if (filters.importBatchId) and.push({ importBatchId: filters.importBatchId });

  const from = filters.from ? parseDate(filters.from) : undefined;
  const to = filters.to ? parseDate(filters.to, true) : undefined;
  if (from || to) {
    and.push({
      effectiveDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
    });
  }

  // Status: NEW / NORMAL include profile-less records (their effective default).
  if (filters.status && LEAD_STATUS_VALUES.includes(filters.status as LeadStatus)) {
    const status = filters.status as LeadStatus;
    if (status === "NEW") {
      and.push({ OR: [{ leadProfile: { is: null } }, { leadProfile: { status } }] });
    } else {
      and.push({ leadProfile: { status } });
    }
  }

  if (
    filters.priority &&
    LEAD_PRIORITY_VALUES.includes(filters.priority as LeadPriority)
  ) {
    const priority = filters.priority as LeadPriority;
    if (priority === "NORMAL") {
      and.push({ OR: [{ leadProfile: { is: null } }, { leadProfile: { priority } }] });
    } else {
      and.push({ leadProfile: { priority } });
    }
  }

  if (filters.assignedTo) {
    and.push({ leadProfile: { assignedToId: filters.assignedTo } });
  }
  if (filters.unassigned === "1") {
    and.push({
      OR: [{ leadProfile: { is: null } }, { leadProfile: { assignedToId: null } }],
    });
  }

  if (filters.tags) {
    const ids = filters.tags.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      and.push({ leadProfile: { tags: { some: { tagId: { in: ids } } } } });
    }
  }

  const presence = (
    field: "primaryEmail" | "primaryPhone" | "website",
    flag: string | undefined,
  ) => {
    if (flag === "has") and.push({ leadProfile: { [field]: { not: null } } });
    else if (flag === "missing")
      and.push({
        OR: [{ leadProfile: { is: null } }, { leadProfile: { [field]: null } }],
      });
  };
  presence("primaryEmail", filters.hasEmail);
  presence("primaryPhone", filters.hasPhone);
  presence("website", filters.hasWebsite);

  const today = startOfToday(now);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const in7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  switch (filters.followUp) {
    case "overdue":
      and.push({ leadProfile: { followUpAt: { lt: today } } });
      break;
    case "today":
      and.push({ leadProfile: { followUpAt: { gte: today, lt: tomorrow } } });
      break;
    case "upcoming":
      and.push({ leadProfile: { followUpAt: { gte: tomorrow, lt: in7 } } });
      break;
    case "range": {
      const f = filters.followUpFrom ? parseDate(filters.followUpFrom) : undefined;
      const t = filters.followUpTo ? parseDate(filters.followUpTo, true) : undefined;
      if (f || t)
        and.push({
          leadProfile: {
            followUpAt: { ...(f ? { gte: f } : {}), ...(t ? { lte: t } : {}) },
          },
        });
      break;
    }
    default:
      break;
  }

  if (filters.recentlyUpdated === "1") {
    and.push({
      leadProfile: {
        updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
    });
  }
  if (filters.qualified === "1")
    and.push({ leadProfile: { qualifiedAt: { not: null } } });
  if (filters.disqualified === "1")
    and.push({ leadProfile: { status: "DISQUALIFIED" } });

  // Archive handling: default excludes archived; "only" shows only archived;
  // "include" applies no archive constraint.
  if (filters.archived === "only") {
    and.push({ leadProfile: { status: "ARCHIVED" } });
  } else if (filters.archived !== "include") {
    and.push({ NOT: { leadProfile: { status: "ARCHIVED" } } });
  }

  return and.length > 0 ? { AND: and } : {};
}

/** Map a sort option to a Prisma orderBy over BusinessRecord (+ relation). */
export function buildLeadOrderBy(
  sort: string | undefined,
): Prisma.BusinessRecordOrderByWithRelationInput {
  switch (sort) {
    case "effective_asc":
      return { effectiveDate: "asc" };
    case "name_asc":
      return { businessName: "asc" };
    case "imported_desc":
      return { createdAt: "desc" };
    case "updated_desc":
      return { leadProfile: { updatedAt: "desc" } };
    case "followup_asc":
      return { leadProfile: { followUpAt: "asc" } };
    case "priority_desc":
      return { leadProfile: { priority: "desc" } };
    case "status_asc":
      return { leadProfile: { status: "asc" } };
    case "county_asc":
      return { county: "asc" };
    case "effective_desc":
    default:
      return { effectiveDate: "desc" };
  }
}

/** Clamp a requested page size to an allowed option. */
export function normalizePageSize(value: string | number | undefined): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : value;
  return PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number])
    ? (n as number)
    : DEFAULT_PAGE_SIZE;
}

/** Convert filters back to a plain query-string record (for links/segments). */
export function filtersToParams(filters: LeadFilters): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const v = filters[key];
    if (v) params[key] = v;
  }
  return params;
}
