import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AiReviewActions } from "@/components/ai/ai-review-actions";

export const metadata: Metadata = { title: "AI review" };

export default async function AiReviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const items = await prisma.aiAnalysis.findMany({
    where: { status: "NEEDS_REVIEW" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { businessRecord: { select: { id: true, businessName: true, businessCity: true, county: true } } },
  });

  return (
    <div>
      <PageHeader
        title="AI review"
        description="AI analyses flagged for a human decision (low confidence, insufficient data, or many warnings)."
        action={<Link href="/ai" className="text-sm font-medium text-brand-600 hover:text-brand-700">← Back to AI</Link>}
      />
      <Card>
        <CardBody className="p-0">
          {items.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-slate-400">Nothing to review.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <Link href={`/leads/${a.businessRecord.id}?tab=ai`} className="block truncate font-medium text-slate-900 hover:text-brand-700">
                      {a.businessRecord.businessName}
                    </Link>
                    <p className="text-xs text-slate-400">{a.businessRecord.businessCity ?? "—"} · {a.businessRecord.county ?? "—"}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {a.industry && <Badge tone="neutral">{a.industry}</Badge>}
                      {a.segment && <Badge tone="neutral">{a.segment}</Badge>}
                      {a.leadScore != null && <Badge tone={a.leadScore >= 60 ? "success" : "warning"}>Score {a.leadScore}</Badge>}
                      {a.qualificationRecommendation && <Badge tone="brand">{a.qualificationRecommendation}</Badge>}
                    </div>
                  </div>
                  <AiReviewActions analysisId={a.id} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
