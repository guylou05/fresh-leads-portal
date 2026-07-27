import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportStatusBadge } from "@/components/imports/status-badge";
import { PreviewConfirm } from "@/components/imports/preview-confirm";
import { ImportProgress } from "@/components/imports/import-progress";
import { DeleteBatchButton } from "@/components/imports/delete-batch-button";
import { REPORT_TYPES } from "@/lib/imports/report-type";
import type { DuplicateClass, PreviewRow } from "@/lib/imports/types";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Import details" };

type ImportMeta = {
  mapping?: { field: string; header: string; index: number }[];
  unknownHeaders?: string[];
  reportType?: { value: string; confidence: string };
  preview?: PreviewRow[];
  summary?: Record<string, number>;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const CLASS_TONE: Record<DuplicateClass, "neutral" | "success" | "warning" | "danger" | "brand"> = {
  NEW: "success",
  EXACT_DUPLICATE: "neutral",
  POSSIBLE_DUPLICATE: "warning",
  INVALID: "danger",
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default async function ImportDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const batch = await prisma.importBatch.findUnique({
    where: { id },
    include: { uploadedBy: { select: { name: true, email: true } } },
  });
  if (!batch) notFound();

  const meta = (batch.metadata as ImportMeta | null) ?? {};
  const rowErrors = await prisma.importRowError.findMany({
    where: { importBatchId: id },
    orderBy: { rowNumber: "asc" },
    take: 100,
  });
  const totalRowErrors = await prisma.importRowError.count({
    where: { importBatchId: id },
  });

  const canDelete =
    isAdmin(session.user) &&
    (batch.status === "FAILED" || batch.status === "CANCELLED") &&
    batch.importedRows === 0;

  const isReady = batch.status === "READY";
  const isImporting = batch.status === "IMPORTING" || batch.status === "VALIDATING";
  const isDone =
    batch.status === "COMPLETED" || batch.status === "COMPLETED_WITH_ERRORS";

  return (
    <div>
      <PageHeader
        title="Import details"
        description={batch.originalFileName}
        action={
          <div className="flex items-center gap-3">
            {canDelete && <DeleteBatchButton batchId={batch.id} />}
            <Link
              href="/imports"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              ← Back to imports
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* File & status */}
        <Card className="lg:col-span-2">
          <CardHeader title="File information" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-slate-500">File name</dt>
                <dd className="font-medium text-slate-900">
                  {batch.originalFileName}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Report type</dt>
                <dd className="font-medium text-slate-900">
                  {batch.reportType ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">File type / size</dt>
                <dd className="font-medium text-slate-900">
                  {batch.fileType} · {formatBytes(batch.fileSizeBytes)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Source</dt>
                <dd className="font-medium text-slate-900">{batch.source}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Uploaded by</dt>
                <dd className="font-medium text-slate-900">
                  {batch.uploadedBy?.name ?? batch.uploadedBy?.email ?? "Unknown"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Checksum (SHA-256)</dt>
                <dd className="truncate font-mono text-xs text-slate-600">
                  {batch.checksum.slice(0, 16)}…
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Uploaded</dt>
                <dd className="text-slate-700">
                  {formatDateTime(batch.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">
                  {batch.failedAt ? "Failed" : "Completed"}
                </dt>
                <dd className="text-slate-700">
                  {batch.failedAt
                    ? formatDateTime(batch.failedAt)
                    : batch.completedAt
                      ? formatDateTime(batch.completedAt)
                      : "—"}
                </dd>
              </div>
            </dl>
            {batch.errorMessage && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {batch.errorMessage}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Status" />
          <CardBody className="space-y-4">
            <ImportStatusBadge status={batch.status} />
            {isDone && (
              <Link
                href={`/leads?importBatchId=${batch.id}`}
                className="block text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View {batch.importedRows.toLocaleString()} imported records →
              </Link>
            )}
            {(isDone || batch.status === "FAILED") && totalRowErrors > 0 && (
              <a
                href={`/api/imports/${batch.id}/errors`}
                className="block text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Download {totalRowErrors.toLocaleString()} invalid rows (CSV) →
              </a>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Metrics */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Total rows" value={batch.totalRows} />
        <Metric label="Valid rows" value={batch.validRows} />
        <Metric label="Imported" value={batch.importedRows} />
        <Metric label="Duplicates" value={batch.duplicateRows} />
        <Metric label="Skipped" value={batch.skippedRows} />
        <Metric label="Invalid rows" value={batch.invalidRows} />
      </div>

      {/* Column mapping */}
      {meta.mapping && meta.mapping.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Detected column mapping"
            description="How source columns were mapped to internal fields."
          />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {meta.mapping.map((m) => (
                <span
                  key={m.field}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs"
                >
                  <span className="font-mono text-slate-500">{m.header}</span>
                  <span className="text-slate-300">→</span>
                  <span className="font-medium text-slate-700">{m.field}</span>
                </span>
              ))}
            </div>
            {meta.unknownHeaders && meta.unknownHeaders.length > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                Unmapped columns (ignored): {meta.unknownHeaders.join(", ")}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Ready: preview + confirm */}
      {isReady && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Preview"
              description="First rows with detected duplicate status. Review before importing."
            />
            <CardBody className="p-0">
              <PreviewTable rows={meta.preview ?? []} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Confirm import" />
            <CardBody>
              <PreviewConfirm
                batchId={batch.id}
                reportType={batch.reportType ?? "Unknown"}
                reportTypeOptions={[...REPORT_TYPES]}
                possibleDuplicates={
                  meta.summary?.possibleDuplicates ??
                  Math.max(0, batch.duplicateRows)
                }
              />
            </CardBody>
          </Card>
        </div>
      )}

      {/* Importing: progress */}
      {isImporting && (
        <Card className="mt-6">
          <CardBody>
            <ImportProgress batchId={batch.id} totalRows={batch.totalRows} />
          </CardBody>
        </Card>
      )}

      {/* Row errors */}
      {rowErrors.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Row errors"
            description={`${totalRowErrors.toLocaleString()} invalid row(s). Showing first ${rowErrors.length}.`}
            action={
              <a
                href={`/api/imports/${batch.id}/errors`}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Download CSV
              </a>
            }
          />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Row</th>
                    <th className="px-5 py-3 font-medium">Code</th>
                    <th className="px-5 py-3 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rowErrors.map((err) => (
                    <tr key={err.id}>
                      <td className="px-5 py-2 tabular-nums text-slate-600">
                        {err.rowNumber}
                      </td>
                      <td className="px-5 py-2">
                        <code className="text-xs text-slate-600">
                          {err.errorCode}
                        </code>
                      </td>
                      <td className="px-5 py-2 text-slate-700">
                        {err.errorMessage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-slate-400">
        No preview rows available.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Business name</th>
            <th className="px-4 py-3 font-medium">Effective</th>
            <th className="px-4 py-3 font-medium">City</th>
            <th className="px-4 py-3 font-medium">County</th>
            <th className="px-4 py-3 font-medium">Charter</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.rowNumber}>
              <td className="px-4 py-2">
                <span className="font-medium text-slate-900">
                  {row.businessName}
                </span>
                {row.warnings.length > 0 && (
                  <span className="block text-xs text-amber-600">
                    {row.warnings.join("; ")}
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-slate-600">
                {row.effectiveDate ?? "—"}
              </td>
              <td className="px-4 py-2 text-slate-600">
                {row.businessCity ?? "—"}
              </td>
              <td className="px-4 py-2 text-slate-600">{row.county ?? "—"}</td>
              <td className="px-4 py-2 text-slate-600">
                {row.charterNumber ?? "—"}
              </td>
              <td className="px-4 py-2">
                <Badge tone={CLASS_TONE[row.classification]}>
                  {row.classification.replace(/_/g, " ").toLowerCase()}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
