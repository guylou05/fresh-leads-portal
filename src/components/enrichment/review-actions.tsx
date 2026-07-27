"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  clearEnrichmentAction,
  enrichSingleLeadAction,
  markReviewedAction,
  type EnrichActionResult,
} from "@/app/(app)/enrichment/actions";

export function ReviewActions({ businessRecordId }: { businessRecordId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<EnrichActionResult>) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast(r.message ?? "Done.", "success");
        router.refresh();
      } else toast(r.error ?? "Action failed.", "error");
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" loading={isPending} onClick={() => run(() => markReviewedAction(businessRecordId))}>
        Accept
      </Button>
      <Button size="sm" variant="secondary" loading={isPending} onClick={() => run(() => enrichSingleLeadAction(businessRecordId, true))}>
        Retry
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={isPending}
        onClick={() => {
          if (window.confirm("Clear automated enrichment for this lead?"))
            run(() => clearEnrichmentAction(businessRecordId));
        }}
      >
        Clear
      </Button>
    </div>
  );
}
