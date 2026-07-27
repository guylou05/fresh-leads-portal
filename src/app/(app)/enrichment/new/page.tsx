import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { EnrichmentScope } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EnrichmentJobForm } from "@/components/enrichment/job-form";
import { getEnrichmentSettings } from "@/lib/enrichment/service";
import { buildLeadWhere, parseLeadFilters } from "@/lib/leads/query";

export const metadata: Metadata = { title: "New enrichment job" };

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function NewEnrichmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const sp = await searchParams;
  const settings = await getEnrichmentSettings();

  const single = one(sp.businessRecordId);
  const idsParam = one(sp.ids);
  const importBatchId = one(sp.importBatchId);

  let scope: EnrichmentScope;
  let count = 0;
  let businessRecordIds: string[] | undefined;
  let filters: Record<string, string> | undefined;

  if (single) {
    scope = "SINGLE_LEAD";
    businessRecordIds = [single];
    count = 1;
  } else if (idsParam) {
    scope = "SELECTED_LEADS";
    businessRecordIds = idsParam.split(",").filter(Boolean).slice(0, settings.maxLeadsPerJob);
    count = businessRecordIds.length;
  } else if (importBatchId) {
    scope = "IMPORT_BATCH";
    count = await prisma.businessRecord.count({ where: { importBatchId } });
  } else {
    scope = "FILTERED_RESULTS";
    const leadFilters = parseLeadFilters(sp);
    filters = leadFilters as Record<string, string>;
    count = await prisma.businessRecord.count({ where: buildLeadWhere(leadFilters) });
  }

  const cappedCount = Math.min(count, settings.maxLeadsPerJob);

  return (
    <div>
      <PageHeader
        title="New enrichment job"
        description="Choose what to enrich and review the estimate before starting."
        action={
          <Link href="/enrichment" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            ← Back to enrichment
          </Link>
        }
      />
      <Card>
        <CardHeader
          title={`Scope: ${scope.replace(/_/g, " ").toLowerCase()}`}
          description={`${cappedCount.toLocaleString()} lead(s) in scope (max ${settings.maxLeadsPerJob}/job).`}
        />
        <CardBody>
          {cappedCount === 0 ? (
            <p className="text-sm text-slate-500">
              No leads are in scope. Select leads on the Leads page, choose an
              import batch, or apply filters, then start enrichment.
            </p>
          ) : (
            <EnrichmentJobForm
              scope={scope}
              count={cappedCount}
              businessRecordIds={businessRecordIds}
              importBatchId={importBatchId || undefined}
              filters={filters}
              costPerCallCents={env.GOOGLE_PLACES_COST_PER_CALL_CENTS}
              pageLimit={settings.websitePageLimit}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
