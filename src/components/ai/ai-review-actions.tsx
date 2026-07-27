"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  approveAnalysisAction,
  rejectAnalysisAction,
  type AiActionResult,
} from "@/app/(app)/ai/actions";

export function AiReviewActions({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function run(fn: () => Promise<AiActionResult>) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) { toast(r.message ?? "Done.", "success"); router.refresh(); }
      else toast(r.error ?? "Action failed.", "error");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" loading={isPending} onClick={() => run(() => approveAnalysisAction(analysisId))}>Approve</Button>
      {!rejecting ? (
        <Button size="sm" variant="danger" onClick={() => setRejecting(true)}>Reject</Button>
      ) : (
        <>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="h-8 rounded-lg border border-slate-300 px-2 text-sm" />
          <Button size="sm" variant="danger" loading={isPending} onClick={() => { run(() => rejectAnalysisAction(analysisId, reason)); setRejecting(false); }}>Confirm</Button>
        </>
      )}
    </div>
  );
}
