"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteImportBatch,
  type ImportActionState,
} from "@/app/(app)/imports/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const initial: ImportActionState = {};

export function DeleteBatchButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteImportBatch, initial);
  const handled = useRef<ImportActionState>({});

  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state.ok) {
      toast(state.message ?? "Import deleted.", "success");
      router.push("/imports");
    } else if (state.error) {
      toast(state.error, "error");
      setConfirming(false);
    }
  }, [state, router, toast]);

  if (!confirming) {
    return (
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Delete import
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <span className="text-sm text-slate-600">Delete permanently?</span>
      <Button type="submit" variant="danger" size="sm" loading={pending}>
        Confirm delete
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Keep
      </Button>
    </form>
  );
}
