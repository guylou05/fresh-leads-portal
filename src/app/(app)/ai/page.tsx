import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { formatCentsUsd } from "@/lib/ai/cost";
import { getRedisConnection } from "@/lib/enrichment/queue";
import { AI_HEARTBEAT_KEY, isHeartbeatHealthy, readHeartbeat } from "@/lib/enrichment/worker-health";
import { getAiSettings } from "@/lib/ai/service";

export const metadata: Metadata = { title: "AI analysis" };

function startOfToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

const JOB_TONE: Record<string, "neutral" | "brand" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral", QUEUED: "brand", RUNNING: "warning", PAUSED: "neutral",
  COMPLETED: "success", COMPLETED_WITH_ERRORS: "warning", FAILED: "danger", CANCELLED: "neutral",
};

export default async function AiDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  let aiHeartbeat = null;
  try {
    aiHeartbeat = await readHeartbeat(getRedisConnection(), AI_HEARTBEAT_KEY);
  } catch { /* ignore */ }

  const [jobs, reviewCount, todayCount, usageAgg, settings, industryDist, segmentDist] = await Promise.all([
    prisma.aiJob.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { requestedBy: { select: { name: true } } } }),
    prisma.aiAnalysis.count({ where: { status: "NEEDS_REVIEW" } }),
    prisma.aiLeadJob.count({ where: { createdAt: { gte: startOfToday() } } }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: startOfToday() } }, _sum: { inputTokens: true, outputTokens: true, estimatedCostCents: true } }),
    getAiSettings(),
    prisma.aiAnalysis.groupBy({ by: ["industry"], _count: { _all: true }, orderBy: { _count: { industry: "desc" } }, take: 8 }),
    prisma.aiAnalysis.groupBy({ by: ["segment"], _count: { _all: true }, orderBy: { _count: { segment: "desc" } }, take: 8 }),
  ]);

  const workerOnline = isHeartbeatHealthy(aiHeartbeat);
  const tokens = (usageAgg._sum.inputTokens ?? 0) + (usageAgg._sum.outputTokens ?? 0);

  return (
    <div>
      <PageHeader
        title="AI analysis"
        description="AI-assisted classification, scoring, recommendations, and outreach drafts."
        action={<Link href="/ai/new"><Button>New AI job</Button></Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><CardBody><p className="text-sm text-slate-500">Leads analyzed today</p><p className="mt-2 text-2xl font-bold">{todayCount}</p><p className="text-xs text-slate-400">of {settings.dailyLeadLimit} daily limit</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-slate-500">Tokens today</p><p className="mt-2 text-2xl font-bold">{tokens.toLocaleString()}</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-slate-500">Estimated cost today</p><p className="mt-2 text-2xl font-bold">{formatCentsUsd(usageAgg._sum.estimatedCostCents ?? 0)}</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-slate-500">Awaiting review</p><p className="mt-2 text-2xl font-bold">{reviewCount}</p><Link href="/ai/review" className="text-xs font-medium text-brand-600 hover:text-brand-700">Open review →</Link></CardBody></Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="AI worker" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Worker</dt><dd>{workerOnline ? <Badge tone="success">Online</Badge> : <Badge tone="danger">Offline</Badge>}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Model (classification)</dt><dd className="font-medium text-slate-700">{settings.classificationModel}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">OpenAI key</dt><dd>{env.OPENAI_API_KEY ? <Badge tone="success">Configured</Badge> : <Badge tone="neutral">Stub mode</Badge>}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Prompt version</dt><dd className="font-medium text-slate-700">{settings.promptVersion}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Queue depth</dt><dd className="font-medium text-slate-700">{aiHeartbeat?.queueDepth ?? 0}</dd></div>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Industry distribution" />
          <CardBody className="space-y-1 text-sm">
            {industryDist.length === 0 ? <p className="text-slate-400">No analyses yet.</p> : industryDist.map((d) => (
              <div key={d.industry ?? "none"} className="flex justify-between"><span className="text-slate-600">{d.industry ?? "—"}</span><span className="tabular-nums text-slate-500">{d._count._all}</span></div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Segment distribution" />
          <CardBody className="space-y-1 text-sm">
            {segmentDist.length === 0 ? <p className="text-slate-400">No analyses yet.</p> : segmentDist.map((d) => (
              <div key={d.segment ?? "none"} className="flex justify-between"><span className="text-slate-600">{d.segment ?? "—"}</span><span className="tabular-nums text-slate-500">{d._count._all}</span></div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="AI jobs" description="Recent analysis jobs." />
        <CardBody className="p-0">
          {jobs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">No AI jobs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Created</th><th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">By</th><th className="px-5 py-3 text-right font-medium">Leads</th>
                    <th className="px-5 py-3 text-right font-medium">Done</th><th className="px-5 py-3 text-right font-medium">Review</th>
                    <th className="px-5 py-3 text-right font-medium">Cost</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(j.createdAt)}</td>
                      <td className="px-5 py-3 text-slate-600">{j.jobType.replace(/_/g, " ").toLowerCase()}</td>
                      <td className="px-5 py-3 text-slate-600">{j.requestedBy?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{j.totalLeads}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{j.successfulLeads}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{j.reviewLeads}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatCentsUsd(j.actualCostCents ?? j.estimatedCostCents)}</td>
                      <td className="px-5 py-3"><Badge tone={JOB_TONE[j.status] ?? "neutral"}>{j.status.replace(/_/g, " ").toLowerCase()}</Badge></td>
                      <td className="px-5 py-3 text-right"><Link href={`/ai/jobs/${j.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
