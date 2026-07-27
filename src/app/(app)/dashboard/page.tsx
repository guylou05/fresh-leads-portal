import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const ACTION_LABELS: Record<string, string> = {
  "auth.login.success": "Signed in",
  "auth.login.failed": "Failed sign-in attempt",
  "user.password.changed": "Changed password",
  "user.profile.updated": "Updated profile",
  "admin.user.created": "Created a user",
  "admin.user.role_changed": "Changed a user role",
  "admin.user.status_changed": "Changed a user status",
  "admin.user.password_reset": "Reset a user password",
  "import.file.uploaded": "Uploaded a report",
  "import.completed": "Completed an import",
  "import.failed": "Import failed",
  "lead.status.changed": "Changed a lead status",
  "lead.priority.changed": "Changed a lead priority",
  "lead.assigned": "Assigned a lead",
  "lead.qualified": "Qualified a lead",
  "lead.disqualified": "Disqualified a lead",
  "lead.archived": "Archived a lead",
  "lead.restored": "Restored a lead",
  "lead.bulk": "Ran a bulk action",
  "lead.note.added": "Added a note",
  "tag.created": "Created a tag",
  "segment.shared.created": "Created a shared segment",
};

function startOfToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

async function getMetrics() {
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const in7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const notArchived = { status: { not: "ARCHIVED" as const } };

  try {
    const [
      totalImported,
      profilesTotal,
      newProfiles,
      closed,
      qualified,
      contactReady,
      highPriority,
      assignedActive,
      unassignedProfiles,
      overdue,
      dueToday,
      upcoming,
      recentlyUpdated,
    ] = await Promise.all([
      prisma.businessRecord.count(),
      prisma.leadProfile.count(),
      prisma.leadProfile.count({ where: { status: "NEW" } }),
      prisma.leadProfile.count({
        where: { status: { in: ["WON", "LOST", "DISQUALIFIED", "ARCHIVED"] } },
      }),
      prisma.leadProfile.count({ where: { qualifiedAt: { not: null } } }),
      prisma.leadProfile.count({ where: { status: "CONTACT_READY" } }),
      prisma.leadProfile.count({
        where: { priority: { in: ["HIGH", "URGENT"] }, ...notArchived },
      }),
      prisma.leadProfile.count({
        where: { assignedToId: { not: null }, ...notArchived },
      }),
      prisma.leadProfile.count({
        where: { assignedToId: null, ...notArchived },
      }),
      prisma.leadProfile.count({
        where: { followUpAt: { lt: today }, ...notArchived },
      }),
      prisma.leadProfile.count({
        where: { followUpAt: { gte: today, lt: tomorrow }, ...notArchived },
      }),
      prisma.leadProfile.count({
        where: { followUpAt: { gte: tomorrow, lt: in7 }, ...notArchived },
      }),
      prisma.leadProfile.count({ where: { updatedAt: { gte: weekAgo } } }),
    ]);

    const withoutProfile = Math.max(0, totalImported - profilesTotal);
    return {
      totalImported,
      activeLeads: totalImported - closed,
      newLeads: newProfiles + withoutProfile,
      qualified,
      contactReady,
      highPriority,
      unassigned: unassignedProfiles + withoutProfile,
      dueToday,
      overdue,
      recentlyUpdated,
      assignedActive,
      upcoming,
    };
  } catch {
    return null;
  }
}

async function getRecentActivity() {
  try {
    return await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { name: true, email: true } } },
    });
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const session = await auth();
  const [metrics, activity] = await Promise.all([
    getMetrics(),
    getRecentActivity(),
  ]);
  const firstName = (session?.user?.name ?? "there").split(" ")[0];
  const m = metrics;

  const tiles: { label: string; value: number; href?: string }[] = [
    { label: "Total businesses", value: m?.totalImported ?? 0, href: "/leads?archived=include" },
    { label: "Active leads", value: m?.activeLeads ?? 0, href: "/leads" },
    { label: "New leads", value: m?.newLeads ?? 0, href: "/leads?status=NEW" },
    { label: "Qualified", value: m?.qualified ?? 0, href: "/leads?qualified=1" },
    { label: "Contact ready", value: m?.contactReady ?? 0, href: "/leads?status=CONTACT_READY" },
    { label: "High priority", value: m?.highPriority ?? 0, href: "/leads?priority=HIGH" },
    { label: "Unassigned", value: m?.unassigned ?? 0, href: "/leads?unassigned=1" },
    { label: "Due today", value: m?.dueToday ?? 0, href: "/leads?followUp=today" },
    { label: "Overdue follow-ups", value: m?.overdue ?? 0, href: "/leads?followUp=overdue" },
    { label: "Recently updated", value: m?.recentlyUpdated ?? 0, href: "/leads?recentlyUpdated=1" },
  ];

  const quickLinks = [
    { label: "Review new leads", href: "/leads?status=NEW" },
    { label: "View unassigned leads", href: "/leads?unassigned=1" },
    { label: "View overdue follow-ups", href: "/leads/follow-ups" },
    { label: "Create a segment", href: "/segments" },
    { label: "Browse recent imports", href: "/imports" },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your lead pipeline at a glance."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const inner = (
            <CardBody>
              <p className="text-sm font-medium text-slate-500">{t.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {t.value.toLocaleString()}
              </p>
            </CardBody>
          );
          return (
            <Card key={t.label} className={t.href ? "transition hover:border-brand-300" : ""}>
              {t.href ? <Link href={t.href}>{inner}</Link> : inner}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" description="Recent account and lead actions." />
          <CardBody className="p-0">
            {activity.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                No activity yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {entry.user?.name ?? entry.user?.email ?? "System"}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-slate-400">
                      {formatDateTime(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quick links" />
          <CardBody>
            <ul className="space-y-2">
              {quickLinks.map((q) => (
                <li key={q.href}>
                  <Link
                    href={q.href}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-300 hover:bg-slate-50"
                  >
                    {q.label}
                    <span aria-hidden="true" className="text-slate-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">Phase</span>
              <Badge tone="brand">Phase 3 · Lead management</Badge>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
