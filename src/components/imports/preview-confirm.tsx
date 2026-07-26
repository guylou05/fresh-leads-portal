"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  cancelImport,
  startImport,
  type ImportActionState,
} from "@/app/(app)/imports/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

const initial: ImportActionState = {};

export function PreviewConfirm({
  batchId,
  reportType,
  reportTypeOptions,
  possibleDuplicates,
}: {
  batchId: string;
  reportType: string;
  reportTypeOptions: string[];
  possibleDuplicates: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [startState, startAction, starting] = useActionState(
    startImport,
    initial,
  );
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelImport,
    initial,
  );

  useEffect(() => {
    if (startState.ok) {
      toast(startState.message ?? "Import started.", "success");
      router.refresh();
    } else if (startState.error) {
      toast(startState.error, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startState]);

  useEffect(() => {
    if (cancelState.ok) {
      toast(cancelState.message ?? "Import cancelled.", "success");
      router.push("/imports");
    } else if (cancelState.error) {
      toast(cancelState.error, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelState]);

  return (
    <div className="flex flex-col gap-4">
      <form action={startAction} className="flex flex-col gap-4">
        <input type="hidden" name="batchId" value={batchId} />

        <div className="max-w-xs">
          <Label htmlFor="reportType">Report type</Label>
          <select
            id="reportType"
            name="reportType"
            defaultValue={reportType}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {reportTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            Auto-detected — correct it if needed before importing.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="includePossible"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            Include possible duplicates ({possibleDuplicates.toLocaleString()}).
            <span className="block text-xs text-slate-400">
              By default, possible duplicates are skipped. Exact duplicates are
              always skipped.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={starting} disabled={cancelling}>
            Confirm & import
          </Button>
        </div>
      </form>

      <form action={cancelAction}>
        <input type="hidden" name="batchId" value={batchId} />
        <Button
          type="submit"
          variant="ghost"
          loading={cancelling}
          disabled={starting}
        >
          Cancel import
        </Button>
      </form>
    </div>
  );
}
