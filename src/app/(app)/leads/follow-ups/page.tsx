import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/leads/badges";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Follow-ups" };

function startOfToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

async function loadGroup(where: object) {
  return prisma.leadProfile.findMany({
    where: { status: { not: "ARCHIVED" }, ...where },
    orderBy: { followUpAt: "asc" },
    take: 100,
    include: {
      businessRecord: { select: { id: true, businessName: true, county: true } },
      assignedTo: { select: { name: true } },
    },
  });
}

type Group = Awaited<ReturnType<typeof loadGroup>>;

function FollowUpList({ items }: { items: Group }) {
  if (items.length === 0) {
    return <p className="px-5 py-6 text-center text-sm text-slate-400">Nothing here.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <Link
              href={`/leads/${p.businessRecord.id}`}
              className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700"
            >
              {p.businessRecord.businessName}
            </Link>
            <p className="text-xs text-slate-400">
              {p.businessRecord.county ?? "—"} ·{" "}
              {p.assignedTo?.name ?? "Unassigned"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <StatusBadge status={p.status} />
            <time className="text-xs text-slate-500">
              {p.followUpAt ? formatDateTime(p.followUpAt) : "—"}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function FollowUpsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const in7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [overdue, dueToday, upcoming] = await Promise.all([
    loadGroup({ followUpAt: { lt: today } }),
    loadGroup({ followUpAt: { gte: today, lt: tomorrow } }),
    loadGroup({ followUpAt: { gte: tomorrow, lt: in7 } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description="Leads with scheduled follow-up dates (times shown in UTC)."
        action={
          <Link
            href="/leads?followUp=overdue"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Open in Leads →
          </Link>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title={`Overdue (${overdue.length})`}
            description="Follow-up dates in the past."
          />
          <CardBody className="p-0">
            <FollowUpList items={overdue} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Due today (${dueToday.length})`} />
          <CardBody className="p-0">
            <FollowUpList items={dueToday} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Upcoming — next 7 days (${upcoming.length})`} />
          <CardBody className="p-0">
            <FollowUpList items={upcoming} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
