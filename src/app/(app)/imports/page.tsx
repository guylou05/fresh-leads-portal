import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImportStatusBadge } from "@/components/imports/status-badge";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Imports" };

export default async function ImportsPage() {
  const session = await auth();
  const currentUserId = session?.user?.id;

  const batches = await prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Imports"
        description="Upload and track Ohio Secretary of State business reports."
        action={
          <Link href="/imports/new">
            <Button>Upload report</Button>
          </Link>
        }
      />

      {batches.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              </svg>
            </div>
            <div className="max-w-md">
              <h2 className="text-base font-semibold text-slate-900">
                No imports yet
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Upload your first Ohio business report to start building your
                lead database.
              </p>
            </div>
            <Link href="/imports/new">
              <Button>Upload report</Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">File</th>
                  <th className="px-5 py-3 font-medium">Report type</th>
                  <th className="px-5 py-3 font-medium">Uploaded</th>
                  <th className="px-5 py-3 font-medium">Uploaded by</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Imported</th>
                  <th className="px-5 py-3 text-right font-medium">Dupes</th>
                  <th className="px-5 py-3 text-right font-medium">Invalid</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((batch) => {
                  const who =
                    batch.uploadedById === currentUserId
                      ? "You"
                      : (batch.uploadedBy?.name ??
                        batch.uploadedBy?.email ??
                        "Unknown");
                  return (
                    <tr key={batch.id}>
                      <td className="max-w-[220px] px-5 py-3">
                        <span className="block truncate font-medium text-slate-900">
                          {batch.originalFileName}
                        </span>
                        <span className="text-xs text-slate-400">
                          {batch.fileType} · {batch.source}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {batch.reportType ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {formatDateTime(batch.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{who}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {batch.totalRows.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {batch.importedRows.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {batch.duplicateRows.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {batch.invalidRows.toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <ImportStatusBadge status={batch.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/imports/${batch.id}`}
                          className="text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                          View details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
