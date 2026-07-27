import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { canViewSegment } from "@/lib/leads/permissions";
import { filtersToParams, sanitizeFilters } from "@/lib/leads/query";

export const metadata: Metadata = { title: "Segment" };

export default async function SegmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const segment = await prisma.savedSegment.findUnique({
    where: { id },
    include: { owner: { select: { name: true } } },
  });
  if (!segment || !canViewSegment(session.user, segment)) notFound();

  const filters = sanitizeFilters(segment.filters);
  const entries = Object.entries(filters);
  const href = `/leads?${new URLSearchParams(filtersToParams(filters)).toString()}`;

  return (
    <div>
      <PageHeader
        title={segment.name}
        description={segment.description ?? undefined}
        action={
          <Link
            href="/segments"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            ← All segments
          </Link>
        }
      />
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={segment.visibility === "SHARED" ? "brand" : "neutral"}>
              {segment.visibility === "SHARED" ? "Shared" : "Private"}
            </Badge>
            <span className="text-sm text-slate-500">Owner: {segment.owner.name}</span>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Saved filters
            </h3>
            {entries.length === 0 ? (
              <p className="text-sm text-slate-400">No filters (matches all active leads).</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {entries.map(([key, value]) => (
                  <li
                    key={key}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                  >
                    <span className="font-medium text-slate-700">{key}</span>: {value}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href={href}
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Apply to Leads
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
