import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReviewActions } from "@/components/enrichment/review-actions";

export const metadata: Metadata = { title: "Enrichment review" };

export default async function EnrichmentReviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const items = await prisma.businessEnrichment.findMany({
    where: { OR: [{ manualReviewRequired: true }, { enrichmentStatus: "NEEDS_REVIEW" }] },
    orderBy: { lastEnrichedAt: "desc" },
    take: 100,
    include: { businessRecord: { select: { id: true, businessName: true, businessCity: true, county: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Enrichment review"
        description="Leads whose enrichment needs a human decision (low confidence, conflicts, or multiple matches)."
        action={
          <Link href="/enrichment" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            ← Back to enrichment
          </Link>
        }
      />
      <Card>
        <CardBody className="p-0">
          {items.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-slate-400">
              Nothing to review. Enriched leads that need attention will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <Link
                      href={`/leads/${e.businessRecord.id}?tab=enrichment`}
                      className="block truncate font-medium text-slate-900 hover:text-brand-700"
                    >
                      {e.businessRecord.businessName}
                    </Link>
                    <p className="text-xs text-slate-400">
                      {e.businessRecord.businessCity ?? "—"} · {e.businessRecord.county ?? "—"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {e.overallConfidence != null && (
                        <Badge tone={e.overallConfidence >= 60 ? "warning" : "danger"}>
                          Confidence {e.overallConfidence}
                        </Badge>
                      )}
                      {e.website && <span className="text-slate-500">Website: {e.website}</span>}
                      {e.phone && <span className="text-slate-500">Phone: {e.phone}</span>}
                    </div>
                  </div>
                  <ReviewActions businessRecordId={e.businessRecord.id} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
