import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PriorityBadge } from "@/components/leads/badges";
import { WorkflowPanel } from "@/components/leads/workflow-panel";
import { TagSelector } from "@/components/leads/tag-selector";
import { NotesPanel, type NoteItem } from "@/components/leads/notes-panel";
import {
  EnrichmentPanel,
  type EnrichmentView,
  type SourceView,
} from "@/components/enrichment/enrichment-panel";
import { effectiveLeadState } from "@/lib/leads/profile";
import { formatCentsUsd } from "@/lib/leads/validation";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Lead details" };

const TABS = ["overview", "enrichment", "notes", "activity", "filing"] as const;
type Tab = (typeof TABS)[number];

function dtLocal(date: Date | null): string {
  return date ? date.toISOString().slice(0, 16) : "";
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value?.trim() || "—"}</dd>
    </div>
  );
}

export default async function LeadDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview";

  const record = await prisma.businessRecord.findUnique({
    where: { id },
    include: {
      importBatch: { select: { id: true, originalFileName: true } },
      enrichment: true,
      leadProfile: {
        include: {
          assignedTo: { select: { name: true } },
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          notes: {
            orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
            include: { author: { select: { name: true } } },
          },
          activities: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: { actor: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!record) notFound();

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const allTags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });

  const profile = record.leadProfile;
  const eff = effectiveLeadState(profile ?? null);
  const admin = isAdmin(session.user);
  const userId = session.user.id;

  const currentTags = profile?.tags.map((lt) => lt.tag) ?? [];
  const notes: NoteItem[] =
    profile?.notes.map((n) => ({
      id: n.id,
      body: n.body,
      isPinned: n.isPinned,
      authorName: n.author.name,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      canModify: admin || n.authorId === userId,
    })) ?? [];

  const workflowInitial = {
    status: eff.status,
    priority: eff.priority,
    assignedToId: profile?.assignedToId ?? null,
    primaryContactName: profile?.primaryContactName ?? "",
    primaryContactTitle: profile?.primaryContactTitle ?? "",
    primaryEmail: profile?.primaryEmail ?? "",
    primaryPhone: profile?.primaryPhone ?? "",
    website: profile?.website ?? "",
    customIndustry: profile?.customIndustry ?? "",
    estimatedValue:
      profile?.estimatedValueCents != null
        ? (profile.estimatedValueCents / 100).toFixed(2)
        : "",
    internalSummary: profile?.internalSummary ?? "",
    followUpAt: dtLocal(profile?.followUpAt ?? null),
    lastContactedAt: dtLocal(profile?.lastContactedAt ?? null),
    disqualificationReason: profile?.disqualificationReason ?? null,
  };

  const enr = record.enrichment;
  const enrichmentView: EnrichmentView | null = enr
    ? {
        status: enr.enrichmentStatus,
        overallConfidence: enr.overallConfidence,
        needsReview: enr.manualReviewRequired,
        lastEnrichedAt: enr.lastEnrichedAt ? enr.lastEnrichedAt.toISOString() : null,
        website: {
          value: enr.website,
          source: enr.websiteSource,
          confidence: enr.websiteConfidence,
          verifiedAt: enr.websiteVerifiedAt ? enr.websiteVerifiedAt.toISOString() : null,
        },
        phone: { value: enr.phone, source: enr.phoneSource, confidence: enr.phoneConfidence },
        email: { value: enr.publicEmail, source: enr.emailSource, confidence: enr.emailConfidence },
        contactPageUrl: enr.contactPageUrl,
        social: [
          enr.facebookUrl ? { label: "Facebook", url: enr.facebookUrl } : null,
          enr.linkedinUrl ? { label: "LinkedIn", url: enr.linkedinUrl } : null,
          enr.instagramUrl ? { label: "Instagram", url: enr.instagramUrl } : null,
          enr.xUrl ? { label: "X", url: enr.xUrl } : null,
          enr.youtubeUrl ? { label: "YouTube", url: enr.youtubeUrl } : null,
        ].filter((s): s is { label: string; url: string } => s !== null),
        google: {
          name: enr.googleBusinessName,
          category: enr.googlePrimaryCategory,
          status: enr.googleBusinessStatus,
          address: enr.googleAddress,
        },
      }
    : null;
  const enrichmentSources: SourceView[] =
    tab === "enrichment"
      ? (
          await prisma.enrichmentSourceRecord.findMany({
            where: { businessRecordId: id },
            orderBy: { retrievedAt: "desc" },
            take: 30,
          })
        ).map((s) => ({
          id: s.id,
          fieldName: s.fieldName,
          provider: s.provider,
          sourceUrl: s.sourceUrl,
          confidence: s.confidence,
          matchReason: s.matchReason,
          retrievedAt: s.retrievedAt.toISOString(),
        }))
      : [];

  const filingAddress = [
    record.filingAddress1,
    record.filingAddress2,
    [record.filingCity, record.filingState, record.filingZip]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div>
      <PageHeader
        title={record.businessName}
        description="Official filing data stays read-only; sales workflow is editable below."
        action={
          <Link
            href="/leads"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            ← Back to leads
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={eff.status} />
        <PriorityBadge priority={eff.priority} />
        {profile?.assignedTo?.name ? (
          <Badge tone="neutral">Assigned: {profile.assignedTo.name}</Badge>
        ) : (
          <Badge tone="neutral">Unassigned</Badge>
        )}
        {profile?.disqualificationReason && eff.status === "DISQUALIFIED" && (
          <Badge tone="danger">Disqualified: {profile.disqualificationReason}</Badge>
        )}
        {profile?.estimatedValueCents != null && (
          <Badge tone="brand">{formatCentsUsd(profile.estimatedValueCents)}</Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/leads/${id}?tab=${t}`}
            className={
              tab === t
                ? "border-b-2 border-brand-600 px-4 py-2 text-sm font-medium text-brand-700"
                : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
            }
          >
            {t === "filing" ? "Filing data" : t[0]?.toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Sales workflow" description="User-entered sales data." />
            <CardBody>
              <WorkflowPanel
                businessRecordId={id}
                initial={workflowInitial}
                users={users}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Tags" />
            <CardBody>
              <TagSelector
                businessRecordId={id}
                current={currentTags}
                allTags={allTags}
              />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "enrichment" && (
        <Card>
          <CardHeader
            title="Enrichment"
            description="Public business information discovered by the enrichment engine. Kept separate from official filing and manual sales data."
          />
          <CardBody>
            <EnrichmentPanel
              businessRecordId={id}
              enrichment={enrichmentView}
              sources={enrichmentSources}
            />
          </CardBody>
        </Card>
      )}

      {tab === "notes" && (
        <Card>
          <CardHeader title="Notes" description="Internal notes for this lead." />
          <CardBody>
            <NotesPanel businessRecordId={id} notes={notes} />
          </CardBody>
        </Card>
      )}

      {tab === "activity" && (
        <Card>
          <CardHeader title="Activity history" description="Chronological lead history." />
          <CardBody className="p-0">
            {!profile || profile.activities.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                No activity yet. Sales actions on this lead will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {profile.activities.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{a.title}</p>
                      {a.description && (
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-500">
                          {a.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">
                        {a.actor?.name ?? "System"}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-slate-400">
                      {formatDateTime(a.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "filing" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Official filing information" />
            <CardBody>
              <div className="mb-3">
                <Badge tone="brand">Official filing data · read-only</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Business name" value={record.businessName} />
                <Field label="Entity / report type" value={record.entityType} />
                <Field label="Effective date" value={record.effectiveDate ? record.effectiveDate.toISOString().slice(0, 10) : null} />
                <Field label="Charter number" value={record.charterNumber} />
                <Field label="Document number" value={record.documentNumber} />
                <Field label="Transaction description" value={record.transactionDescription} />
                <Field label="Business city" value={record.businessCity} />
                <Field label="County" value={record.county} />
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Filing address & agent" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Filing address
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
                    {filingAddress || "—"}
                  </dd>
                </div>
                <Field label="Statutory agent" value={record.agentName} />
                <Field label="Agent city" value={record.agentCity} />
                <Field label="Associate names" value={record.associateNamesRaw} />
                <Field label="Source" value={record.source} />
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
                <Link
                  href={`/imports/${record.importBatch.id}`}
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  View source import: {record.importBatch.originalFileName} →
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
