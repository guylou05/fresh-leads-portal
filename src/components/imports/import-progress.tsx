"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StatusResponse = {
  status: string;
  totalRows: number;
  importedRows: number;
};

const TERMINAL = new Set([
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "FAILED",
  "CANCELLED",
]);

export function ImportProgress({
  batchId,
  totalRows,
}: {
  batchId: string;
  totalRows: number;
}) {
  const router = useRouter();
  const [imported, setImported] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/imports/${batchId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (!active) return;
        setImported(data.importedRows);
        if (TERMINAL.has(data.status)) {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        /* transient network error — keep polling */
      }
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [batchId, router]);

  const pct = totalRows > 0 ? Math.min(100, Math.round((imported / totalRows) * 100)) : 0;

  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-medium text-slate-900">Importing records…</p>
        <p className="mt-1 text-sm text-slate-500" aria-live="polite">
          {imported.toLocaleString()} of {totalRows.toLocaleString()} rows
          processed
        </p>
      </div>
      <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
