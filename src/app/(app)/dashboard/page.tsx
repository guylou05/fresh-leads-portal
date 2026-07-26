import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard",
};

const STATS = [
  { label: "Total Leads", key: "leads" },
  { label: "New Imports", key: "imports" },
  { label: "Enriched Leads", key: "enriched" },
  { label: "High-Priority Leads", key: "priority" },
  { label: "Recent Exports", key: "exports" },
] as const;

const CHECKLIST = [
  {
    label: "Sign in as an administrator",
    done: true,
  },
  {
    label: "Invite your team from Settings → Users",
    done: false,
  },
  {
    label: "Import your first Ohio business report",
    done: false,
  },
  {
    label: "Enrich and segment leads (future phase)",
    done: false,
  },
];

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
  "import.preview.generated": "Generated an import preview",
  "import.started": "Started an import",
  "import.completed": "Completed an import",
  "import.failed": "Import failed",
  "import.cancelled": "Cancelled an import",
  "import.batch.deleted": "Deleted an import",
  "import.errors.downloaded": "Downloaded invalid rows",
};

async function getDashboardCounts() {
  try {
    const [totalLeads, totalImports] = await Promise.all([
      prisma.businessRecord.count(),
      prisma.importBatch.count(),
    ]);
    return { totalLeads, totalImports };
  } catch {
    return { totalLeads: 0, totalImports: 0 };
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

async function getDatabaseStatus(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export default async function DashboardPage() {
  const session = await auth();
  const [activity, dbOnline, counts] = await Promise.all([
    getRecentActivity(),
    getDatabaseStatus(),
    getDashboardCounts(),
  ]);

  const firstName = (session?.user?.name ?? "there").split(" ")[0];

  const statValues: Record<
    (typeof STATS)[number]["key"],
    { value: number; note: string }
  > = {
    leads: { value: counts.totalLeads, note: "Imported business records" },
    imports: { value: counts.totalImports, note: "Report batches" },
    enriched: { value: 0, note: "Coming in a future phase" },
    priority: { value: 0, note: "Coming in a future phase" },
    exports: { value: 0, note: "Coming in a future phase" },
  };

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's the state of your lead pipeline. Import a business report to get started."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {STATS.map((stat) => (
          <Card key={stat.key}>
            <CardBody>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {statValues[stat.key].value.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {statValues[stat.key].note}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Empty state / next step */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Get started"
            description="Your next step is to import a newly registered business report."
          />
          <CardBody>
            <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
              <Badge tone="brand">Next step</Badge>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Import a business report
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  In an upcoming phase you&apos;ll upload Ohio Secretary of State
                  TXT/CSV reports here. FreshBiz Leads will parse, de-duplicate,
                  enrich, and score the records automatically. No lead data is
                  shown yet because nothing has been imported.
                </p>
              </div>
              <Link
                href="/imports"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Preview the Imports workspace →
              </Link>
            </div>
          </CardBody>
        </Card>

        {/* Quick-start checklist */}
        <Card>
          <CardHeader title="Quick-start checklist" />
          <CardBody>
            <ul className="space-y-3">
              {CHECKLIST.map((item) => (
                <li key={item.label} className="flex items-start gap-3">
                  <span
                    className={
                      item.done
                        ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700"
                        : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-transparent"
                    }
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span
                    className={
                      item.done
                        ? "text-sm text-slate-400 line-through"
                        : "text-sm text-slate-700"
                    }
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent activity"
            description="Audit trail of recent account actions."
          />
          <CardBody className="p-0">
            {activity.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                No activity yet. Actions you take will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activity.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
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

        {/* System status */}
        <Card>
          <CardHeader title="System status" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Application</dt>
                <dd>
                  <Badge tone="success">Operational</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Database</dt>
                <dd>
                  {dbOnline ? (
                    <Badge tone="success">Connected</Badge>
                  ) : (
                    <Badge tone="danger">Unavailable</Badge>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Environment</dt>
                <dd className="font-medium text-slate-700">
                  {process.env.NODE_ENV}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Phase</dt>
                <dd className="font-medium text-slate-700">
                  Phase 1 · Foundation
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
