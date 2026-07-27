import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { formatCentsUsd } from "@/lib/ai/cost";
import { CancelJobButton } from "@/components/ai/cancel-job-button";

export const metadata: Metadata = { title: "AI job" };

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}

export default async function AiJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const job = await prisma.aiJob.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { name: true } },
      leadJobs: { take: 100, orderBy: { createdAt: "asc" }, include: { businessRecord: { select: { id: true, businessName: true } } } },
    },
  });
  if (!job) notFound();

  const active = job.status === "RUNNING" || job.status === "QUEUED";

  return (
    <div>
      <PageHeader
        title="AI job"
        description={`${job.jobType.replace(/_/g, " ").toLowerCase()} · requested by ${job.requestedBy?.name ?? "—"}`}
        action={
          <div className="flex items-center gap-3">
            {active && <CancelJobButton jobId={job.id} />}
            <Link href="/ai" className="text-sm font-medium text-brand-600 hover:text-brand-700">← Back to AI</Link>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "danger" : "brand"}>{job.status.replace(/_/g, " ").toLowerCase()}</Badge>
        <span className="text-xs text-slate-400">Created {formatDateTime(job.createdAt)}{job.completedAt ? ` · Completed ${formatDateTime(job.completedAt)}` : ""}</span>
        <span className="text-xs text-slate-400">Cost {formatCentsUsd(job.actualCostCents ?? job.estimatedCostCents)} · Tokens {((job.inputTokens ?? 0) + (job.outputTokens ?? 0)).toLocaleString()}</span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Total" value={job.totalLeads} />
        <Metric label="Processed" value={job.processedLeads} />
        <Metric label="Successful" value={job.successfulLeads} />
        <Metric label="Review" value={job.reviewLeads} />
        <Metric label="Failed" value={job.failedLeads} />
        <Metric label="Skipped" value={job.skippedLeads} />
      </div>

      <Card>
        <CardHeader title="Leads" />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3 font-medium">Business</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Error</th><th className="px-5 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {job.leadJobs.map((lj) => (
                  <tr key={lj.id}>
                    <td className="px-5 py-2 text-slate-800">{lj.businessRecord.businessName}</td>
                    <td className="px-5 py-2 text-slate-600">{lj.status.toLowerCase()}</td>
                    <td className="px-5 py-2 text-xs text-slate-400">{lj.failureCode ?? "—"}</td>
                    <td className="px-5 py-2 text-right"><Link href={`/leads/${lj.businessRecord.id}?tab=ai`} className="text-sm font-medium text-brand-600 hover:text-brand-700">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
