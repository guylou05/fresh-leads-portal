import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import {
  LeadsFilters,
  type LeadsFilterValues,
} from "@/components/leads/leads-filters";
import { Pagination } from "@/components/leads/pagination";

export const metadata: Metadata = { title: "Leads" };

const PAGE_SIZE = 25;

function str(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseDate(value: string, endOfDay = false): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function buildOrderBy(
  sort: string,
): Prisma.BusinessRecordOrderByWithRelationInput {
  switch (sort) {
    case "effective_asc":
      return { effectiveDate: "asc" };
    case "name_asc":
      return { businessName: "asc" };
    case "imported_desc":
      return { createdAt: "desc" };
    case "county_asc":
      return { county: "asc" };
    case "effective_desc":
    default:
      return { effectiveDate: "desc" };
  }
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const values: LeadsFilterValues = {
    q: str(sp.q),
    county: str(sp.county),
    city: str(sp.city),
    entityType: str(sp.entityType),
    source: str(sp.source),
    importBatchId: str(sp.importBatchId),
    from: str(sp.from),
    to: str(sp.to),
    recent: str(sp.recent),
    sort: str(sp.sort) || "effective_desc",
  };
  const page = Math.max(1, Number.parseInt(str(sp.page), 10) || 1);

  const where: Prisma.BusinessRecordWhereInput = {};
  if (values.q) where.businessName = { contains: values.q, mode: "insensitive" };
  if (values.county) where.county = { contains: values.county, mode: "insensitive" };
  if (values.city) where.businessCity = { contains: values.city, mode: "insensitive" };
  if (values.entityType) where.entityType = values.entityType;
  if (values.source) where.source = values.source;
  if (values.importBatchId) where.importBatchId = values.importBatchId;

  const from = parseDate(values.from);
  const to = parseDate(values.to, true);
  if (from || to) {
    where.effectiveDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }
  if (values.recent === "1") {
    where.createdAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  }

  const [total, records, batches] = await Promise.all([
    prisma.businessRecord.count({ where }),
    prisma.businessRecord.findMany({
      where,
      orderBy: buildOrderBy(values.sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        businessName: true,
        effectiveDate: true,
        entityType: true,
        businessCity: true,
        county: true,
        filingState: true,
        charterNumber: true,
        source: true,
        createdAt: true,
      },
    }),
    prisma.importBatch.findMany({
      where: { importedRows: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, originalFileName: true, createdAt: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const batchOptions = batches.map((b) => ({
    id: b.id,
    label: b.originalFileName,
  }));

  // Params for pagination links (page is set by the component).
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value) params[key] = value;
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Official business filing records imported from your reports."
      />

      <Card className="mb-6">
        <CardBody>
          <LeadsFilters values={values} batchOptions={batchOptions} />
        </CardBody>
      </Card>

      <Card>
        {records.length === 0 ? (
          <CardBody className="py-14 text-center">
            <h2 className="text-base font-semibold text-slate-900">
              No leads found
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {total === 0
                ? "Import an Ohio business report to populate your leads."
                : "No records match the current filters."}
            </p>
            <Link
              href="/imports/new"
              className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Upload a report →
            </Link>
          </CardBody>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 px-4 py-3">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-4 py-3 font-medium">Business name</th>
                    <th className="px-4 py-3 font-medium">Effective</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">City</th>
                    <th className="px-4 py-3 font-medium">County</th>
                    <th className="px-4 py-3 font-medium">State</th>
                    <th className="px-4 py-3 font-medium">Charter</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Imported</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.businessName}`}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <Link
                          href={`/leads/${r.id}`}
                          className="block truncate font-medium text-slate-900 hover:text-brand-700"
                        >
                          {r.businessName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.effectiveDate
                          ? r.effectiveDate.toISOString().slice(0, 10)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.entityType ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.businessCity ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.county ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.filingState ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.charterNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.source}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {r.createdAt.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/leads/${r.id}`}
                          className="text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              params={params}
            />
          </>
        )}
      </Card>
    </div>
  );
}
