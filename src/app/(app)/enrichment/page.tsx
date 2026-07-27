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
import { formatCentsUsd } from "@/lib/enrichment/cost";
import { getRedisConnection } from "@/lib/enrichment/queue";
import { isHeartbeatHealthy, readHeartbeat } from "@/lib/enrichment/worker-health";
import { getEnrichmentSettings } from "@/lib/enrichment/service";

export const metadata: Metadata = { title: "Enrichment" };

function startOfToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

const JOB_TONE: Record<string, "neutral" | "brand" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  QUEUED: "brand",
  RUNNING: "warning",
  PAUSED: "neutral",
  COMPLETED: "success",
  COMPLETED_WITH_ERRORS: "warning",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export default async function EnrichmentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  let heartbeat = null;
  let redisOnline = false;
  try {
    const conn = getRedisConnection();
    redisOnline = (await conn.ping().catch(() => "")) === "PONG";
    heartbeat = await readHeartbeat(conn);
  } catch {
    redisOnline = false;
  }

  const [jobs, reviewCount, todayCount, usageAgg, settings] = await Promise.all([
    prisma.enrichmentJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { requestedBy: { select: { name: true } } },
    }),
    prisma.businessEnrichment.count({ where: { manualReviewRequired: true } }),
    prisma.enrichmentLeadJob.count({ where: { createdAt: { gte: startOfToday() } } }),
    prisma.enrichmentUsage.aggregate({
      where: { createdAt: { gte: startOfToday() } },
      _sum: { requestCount: true, estimatedCostCents: true },
    }),
    getEnrichmentSettings(),
  ]);

  const workerOnline = isHeartbeatHealthy(heartbeat);

  const stats = [
    { label: "Leads enriched today", value: todayCount, sub: `of ${settings.dailyLeadLimit} daily limit` },
    { label: "Provider requests today", value: usageAgg._sum.requestCount ?? 0, sub: "Google + website" },
    { label: "Estimated cost today", value: null, sub: formatCentsUsd(usageAgg._sum.estimatedCostCents ?? 0) },
    { label: "Awaiting review", value: reviewCount, sub: "needs manual review" },
  ];

  return (
    <div>
      <PageHeader
        title="Enrichment"
        description="Enrich leads with public business information using background jobs."
        action={
          <Link href="/enrichment/new">
            <Button>New enrichment job</Button>
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <p className="text-sm font-medium text-slate-500">{s.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {s.value != null ? s.value.toLocaleString() : s.sub}
              </p>
              {s.value != null && <p className="mt-1 text-xs text-slate-400">{s.sub}</p>}
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Worker status" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Worker</dt>
                <dd>{workerOnline ? <Badge tone="success">Online</Badge> : <Badge tone="danger">Offline</Badge>}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Redis</dt>
                <dd>{redisOnline ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Unavailable</Badge>}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Queue depth</dt>
                <dd className="font-medium text-slate-700">{heartbeat?.queueDepth ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Last heartbeat</dt>
                <dd className="text-slate-600">{heartbeat ? formatDateTime(heartbeat.updatedAt) : "—"}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Providers" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Google Places</dt>
                <dd>{env.GOOGLE_MAPS_API_KEY ? <Badge tone="success">Configured</Badge> : <Badge tone="neutral">Not configured</Badge>}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Website crawl</dt>
                <dd>{settings.websiteCrawlEnabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="neutral">Disabled</Badge>}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Cache window</dt>
                <dd className="font-medium text-slate-700">{settings.cacheDays} days</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Review queue" />
          <CardBody>
            <p className="text-sm text-slate-500">
              {reviewCount.toLocaleString()} lead(s) need manual review.
            </p>
            <Link
              href="/enrichment/review"
              className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Open review queue →
            </Link>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Jobs" description="Recent enrichment jobs." />
        <CardBody className="p-0">
          {jobs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">
              No enrichment jobs yet. Start one from a lead, the Leads page, or
              &ldquo;New enrichment job&rdquo;.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Created</th>
                    <th className="px-5 py-3 font-medium">Scope</th>
                    <th className="px-5 py-3 font-medium">By</th>
                    <th className="px-5 py-3 text-right font-medium">Leads</th>
                    <th className="px-5 py-3 text-right font-medium">Done</th>
                    <th className="px-5 py-3 text-right font-medium">Failed</th>
                    <th className="px-5 py-3 text-right font-medium">Cost</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(j.createdAt)}</td>
                      <td className="px-5 py-3 text-slate-600">{j.scope.replace(/_/g, " ").toLowerCase()}</td>
                      <td className="px-5 py-3 text-slate-600">{j.requestedBy?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{j.totalLeads}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{j.processedLeads}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{j.failedLeads}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatCentsUsd(j.actualCostCents ?? j.estimatedCostCents)}</td>
                      <td className="px-5 py-3"><Badge tone={JOB_TONE[j.status] ?? "neutral"}>{j.status.replace(/_/g, " ").toLowerCase()}</Badge></td>
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
