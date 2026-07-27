import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AiJobForm } from "@/components/ai/ai-job-form";
import { getAiSettings } from "@/lib/ai/service";
import { buildLeadWhere, parseLeadFilters, sanitizeFilters } from "@/lib/leads/query";

export const metadata: Metadata = { title: "New AI job" };

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function NewAiJobPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const sp = await searchParams;
  const settings = await getAiSettings();

  const single = one(sp.businessRecordId);
  const idsParam = one(sp.ids);
  const importBatchId = one(sp.importBatchId);
  const savedSegmentId = one(sp.savedSegmentId);

  let scope: "SINGLE_LEAD" | "SELECTED_LEADS" | "FILTERED_RESULTS" | "IMPORT_BATCH" | "SAVED_SEGMENT";
  let count = 0;
  let businessRecordIds: string[] | undefined;
  let filters: Record<string, string> | undefined;

  if (single) { scope = "SINGLE_LEAD"; businessRecordIds = [single]; count = 1; }
  else if (idsParam) { scope = "SELECTED_LEADS"; businessRecordIds = idsParam.split(",").filter(Boolean).slice(0, settings.maxBatchSize); count = businessRecordIds.length; }
  else if (importBatchId) { scope = "IMPORT_BATCH"; count = await prisma.businessRecord.count({ where: { importBatchId } }); }
  else if (savedSegmentId) {
    scope = "SAVED_SEGMENT";
    const seg = await prisma.savedSegment.findUnique({ where: { id: savedSegmentId } });
    count = seg ? await prisma.businessRecord.count({ where: buildLeadWhere(sanitizeFilters(seg.filters)) }) : 0;
  } else {
    scope = "FILTERED_RESULTS";
    const f = parseLeadFilters(sp);
    filters = f as Record<string, string>;
    count = await prisma.businessRecord.count({ where: buildLeadWhere(f) });
  }

  const capped = Math.min(count, settings.maxBatchSize);

  return (
    <div>
      <PageHeader
        title="New AI job"
        description="Run AI classification, scoring, recommendations, or outreach drafting."
        action={<Link href="/ai" className="text-sm font-medium text-brand-600 hover:text-brand-700">← Back to AI</Link>}
      />
      <Card>
        <CardHeader title={`Scope: ${scope.replace(/_/g, " ").toLowerCase()}`} description={`${capped.toLocaleString()} lead(s) in scope (max ${settings.maxBatchSize}/job).`} />
        <CardBody>
          {capped === 0 ? (
            <p className="text-sm text-slate-500">No leads in scope. Select leads, an import batch, a saved segment, or apply filters.</p>
          ) : (
            <AiJobForm
              scope={scope}
              count={capped}
              businessRecordIds={businessRecordIds}
              importBatchId={importBatchId || undefined}
              savedSegmentId={savedSegmentId || undefined}
              filters={filters}
              costPerInputMTok={env.AI_INPUT_COST_PER_MTOK_CENTS}
              costPerOutputMTok={env.AI_OUTPUT_COST_PER_MTOK_CENTS}
              model={settings.classificationModel}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
