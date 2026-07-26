import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Lead details" };

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await prisma.businessRecord.findUnique({
    where: { id },
    include: {
      importBatch: {
        select: { id: true, originalFileName: true, createdAt: true },
      },
      importedBy: { select: { name: true, email: true } },
    },
  });
  if (!record) notFound();

  return (
    <div>
      <PageHeader
        title={record.businessName}
        description="Official filing data"
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
        <Badge tone="brand">Official filing data</Badge>
        {record.entityType && <Badge tone="neutral">{record.entityType}</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Official filing information" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Business name" value={record.businessName} />
              <Field label="Entity / report type" value={record.entityType} />
              <Field label="Document number" value={record.documentNumber} />
              <Field label="Charter number" value={record.charterNumber} />
              <Field
                label="Effective date"
                value={
                  record.effectiveDate
                    ? record.effectiveDate.toISOString().slice(0, 10)
                    : null
                }
              />
              <Field label="Consent flag" value={record.consentFlag} />
              <Field
                label="Transaction description"
                value={record.transactionDescription}
              />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Filing address" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Address name" value={record.filingAddressName} />
              <Field label="Address line 1" value={record.filingAddress1} />
              <Field label="Address line 2" value={record.filingAddress2} />
              <Field label="City" value={record.filingCity} />
              <Field label="State" value={record.filingState} />
              <Field label="ZIP" value={record.filingZip} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Statutory agent" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Agent name" value={record.agentName} />
              <Field label="Address line 1" value={record.agentAddress1} />
              <Field label="Address line 2" value={record.agentAddress2} />
              <Field label="City" value={record.agentCity} />
              <Field label="State" value={record.agentState} />
              <Field label="ZIP" value={record.agentZip} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Business location" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Business city" value={record.businessCity} />
              <Field label="County" value={record.county} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Associated names" />
          <CardBody>
            <p className="text-sm text-slate-800">
              {record.associateNamesRaw?.trim() || "—"}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Preserved as recorded in the source filing.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Source & import details" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Source" value={record.source} />
              <Field
                label="Imported by"
                value={
                  record.importedBy?.name ?? record.importedBy?.email ?? null
                }
              />
              <div className="col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Import batch
                </dt>
                <dd className="mt-0.5 text-sm">
                  <Link
                    href={`/imports/${record.importBatch.id}`}
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    {record.importBatch.originalFileName}
                  </Link>
                </dd>
              </div>
              <Field
                label="Imported at"
                value={formatDateTime(record.createdAt)}
              />
              <Field
                label="Last updated"
                value={formatDateTime(record.updatedAt)}
              />
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
