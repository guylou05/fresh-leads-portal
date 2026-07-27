import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { env } from "@/env";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getEnrichmentSettings } from "@/lib/enrichment/service";
import {
  EnrichmentSettingsForm,
  type SettingsView,
} from "@/components/settings/enrichment-settings-form";

export const metadata: Metadata = { title: "Enrichment settings" };

export default async function EnrichmentSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user)) redirect("/enrichment");

  const settings = await getEnrichmentSettings();
  const view: SettingsView = {
    dailyLeadLimit: settings.dailyLeadLimit,
    maxLeadsPerJob: settings.maxLeadsPerJob,
    cacheDays: settings.cacheDays,
    retryLimit: settings.retryLimit,
    reviewConfidenceThreshold: settings.reviewConfidenceThreshold,
    websiteCrawlEnabled: settings.websiteCrawlEnabled,
    websitePageLimit: settings.websitePageLimit,
    requestTimeoutMs: settings.requestTimeoutMs,
    costCeilingCents: settings.costCeilingCents,
  };

  return (
    <div>
      <PageHeader
        title="Enrichment settings"
        description="Admin-configurable, non-secret enrichment limits."
        action={
          <Link href="/settings" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            ← Settings
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Limits & tuning" />
          <CardBody>
            <EnrichmentSettingsForm initial={view} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Secrets & runtime" description="Configured server-side; never shown here." />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Google Maps API key</dt>
                <dd>{env.GOOGLE_MAPS_API_KEY ? <Badge tone="success">Configured</Badge> : <Badge tone="danger">Not set</Badge>}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Redis</dt>
                <dd><Badge tone="success">Configured</Badge></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Worker concurrency</dt>
                <dd className="font-medium text-slate-700">{env.ENRICHMENT_WORKER_CONCURRENCY}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-400">
              Worker concurrency and secret values are set via environment
              variables and are never editable from or returned to the browser.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
