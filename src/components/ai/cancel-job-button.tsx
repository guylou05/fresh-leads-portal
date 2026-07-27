"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cancelAiJobAction } from "@/app/(app)/ai/actions";

export function CancelJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="danger"
      size="sm"
      loading={isPending}
      onClick={() => {
        if (!window.confirm("Cancel this AI job?")) return;
        startTransition(async () => {
          const r = await cancelAiJobAction(jobId);
          if (r.ok) { toast(r.message ?? "Cancelled.", "success"); router.refresh(); }
          else toast(r.error ?? "Failed.", "error");
        });
      }}
    >
      Cancel job
    </Button>
  );
}
