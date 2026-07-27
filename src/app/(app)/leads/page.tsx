import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import type { LeadRow } from "@/components/leads/types";
import { effectiveLeadState } from "@/lib/leads/profile";
import {
  buildLeadOrderBy,
  buildLeadWhere,
  filtersToParams,
  normalizePageSize,
  parseLeadFilters,
  sanitizeFilters,
} from "@/lib/leads/query";

export const metadata: Metadata = { title: "Leads" };

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const admin = isAdmin(session?.user);
  const sp = await searchParams;

  const filters = parseLeadFilters(sp);
  const where = buildLeadWhere(filters);
  const orderBy = buildLeadOrderBy(filters.sort);
  const pageSize = normalizePageSize(
    Array.isArray(sp.pageSize) ? sp.pageSize[0] : sp.pageSize,
  );
  const page = Math.max(
    1,
    Number.parseInt(Array.isArray(sp.page) ? (sp.page[0] ?? "") : (sp.page ?? ""), 10) || 1,
  );

  const [total, records, users, tags, segments] = await Promise.all([
    prisma.businessRecord.count({ where }),
    prisma.businessRecord.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        businessName: true,
        effectiveDate: true,
        entityType: true,
        businessCity: true,
        county: true,
        charterNumber: true,
        source: true,
        leadProfile: {
          select: {
            status: true,
            priority: true,
            assignedToId: true,
            assignedTo: { select: { name: true } },
            primaryContactName: true,
            primaryEmail: true,
            primaryPhone: true,
            website: true,
            followUpAt: true,
            updatedAt: true,
            tags: {
              select: { tag: { select: { id: true, name: true, color: true } } },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    session?.user?.id
      ? prisma.savedSegment.findMany({
          where: {
            OR: [{ visibility: "SHARED" }, { ownerId: session.user.id }],
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: { id: true, name: true, filters: true },
        })
      : Promise.resolve([]),
  ]);

  const rows: LeadRow[] = records.map((r) => {
    const p = r.leadProfile;
    const eff = effectiveLeadState(p ?? null);
    return {
      businessRecordId: r.id,
      businessName: r.businessName,
      effectiveDate: iso(r.effectiveDate),
      businessCity: r.businessCity,
      county: r.county,
      entityType: r.entityType,
      charterNumber: r.charterNumber,
      source: r.source,
      status: eff.status,
      priority: eff.priority,
      assignedToName: p?.assignedTo?.name ?? null,
      tags: p?.tags.map((lt) => lt.tag) ?? [],
      primaryContactName: p?.primaryContactName ?? null,
      primaryEmail: p?.primaryEmail ?? null,
      primaryPhone: p?.primaryPhone ?? null,
      website: p?.website ?? null,
      followUpAt: iso(p?.followUpAt ?? null),
      updatedAt: iso(p?.updatedAt ?? null),
      hasProfile: eff.hasProfile,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const segmentLinks = segments.map((s) => {
    const params = new URLSearchParams(filtersToParams(sanitizeFilters(s.filters)));
    return { id: s.id, name: s.name, href: `/leads?${params.toString()}` };
  });

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Manage imported businesses as sales leads. Official filing data stays read-only."
      />

      <Card className="mb-6">
        <CardBody>
          <LeadsFilters
            values={filters}
            users={users}
            tags={tags}
            segments={segmentLinks}
            isAdmin={admin}
          />
        </CardBody>
      </Card>

      {total === 0 ? (
        <Card>
          <CardBody className="py-14 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              No leads found
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Adjust your filters, or import an Ohio business report to populate
              your leads.
            </p>
          </CardBody>
        </Card>
      ) : (
        <LeadsTable
          rows={rows}
          users={users}
          tags={tags}
          total={total}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
        />
      )}
    </div>
  );
}
