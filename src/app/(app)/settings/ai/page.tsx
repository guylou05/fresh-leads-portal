import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { env } from "@/env";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAiSettings } from "@/lib/ai/service";
import { AiSettingsForm, type AiSettingsView } from "@/components/settings/ai-settings-form";

export const metadata: Metadata = { title: "AI settings" };

export default async function AiSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user)) redirect("/ai");

  const s = await getAiSettings();
  const view: AiSettingsView = {
    classificationModel: s.classificationModel,
    outreachModel: s.outreachModel,
    dailyLeadLimit: s.dailyLeadLimit,
    maxBatchSize: s.maxBatchSize,
    retryLimit: s.retryLimit,
    reviewConfidenceThreshold: s.reviewConfidenceThreshold,
    costCeilingCents: s.costCeilingCents,
    promptVersion: s.promptVersion,
    aiEnabled: s.aiEnabled,
  };

  return (
    <div>
      <PageHeader
        title="AI settings"
        description="Admin-configurable, non-secret AI settings."
        action={<Link href="/settings" className="text-sm font-medium text-brand-600 hover:text-brand-700">← Settings</Link>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Models & limits" />
          <CardBody><AiSettingsForm initial={view} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Secrets & runtime" description="Configured server-side; never shown here." />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><dt className="text-slate-500">OpenAI API key</dt><dd>{env.OPENAI_API_KEY ? <Badge tone="success">Configured</Badge> : <Badge tone="warning">Not set (stub mode)</Badge>}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-500">Worker concurrency</dt><dd className="font-medium text-slate-700">{env.AI_WORKER_CONCURRENCY}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-500">Temperature</dt><dd className="font-medium text-slate-700">{env.AI_DEFAULT_TEMPERATURE}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-slate-400">The OpenAI key and worker concurrency are set via environment variables and are never editable from or returned to the browser. Without a key, a clearly-labeled deterministic stub model is used.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
