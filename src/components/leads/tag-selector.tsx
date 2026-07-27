"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { TagChip } from "@/components/leads/badges";
import { addTagToLead, removeTagFromLead } from "@/app/(app)/leads/actions";
import type { TagOption } from "@/components/leads/types";

export function TagSelector({
  businessRecordId,
  current,
  allTags,
}: {
  businessRecordId: string;
  current: TagOption[];
  allTags: TagOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [selectValue, setSelectValue] = useState("");

  const currentIds = new Set(current.map((t) => t.id));
  const available = allTags.filter((t) => !currentIds.has(t.id));

  function add(tagId: string) {
    if (!tagId) return;
    startTransition(async () => {
      const result = await addTagToLead(businessRecordId, tagId);
      if (result.ok) {
        toast("Tag added.", "success");
        router.refresh();
      } else toast(result.error ?? "Could not add tag.", "error");
      setSelectValue("");
    });
  }

  function remove(tagId: string) {
    startTransition(async () => {
      const result = await removeTagFromLead(businessRecordId, tagId);
      if (result.ok) {
        toast("Tag removed.", "success");
        router.refresh();
      } else toast(result.error ?? "Could not remove tag.", "error");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {current.length === 0 && (
          <span className="text-sm text-slate-400">No tags yet.</span>
        )}
        {current.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1">
            <TagChip name={t.name} color={t.color} />
            <button
              type="button"
              onClick={() => remove(t.id)}
              disabled={isPending}
              aria-label={`Remove ${t.name}`}
              className="text-slate-400 hover:text-red-600"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {available.length > 0 ? (
        <div className="flex items-center gap-2">
          <select
            value={selectValue}
            onChange={(e) => {
              setSelectValue(e.target.value);
              add(e.target.value);
            }}
            disabled={isPending}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">Add a tag…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        allTags.length === 0 && (
          <p className="text-xs text-slate-400">
            No tags exist yet. An administrator can create tags in Settings → Tags.
          </p>
        )
      )}
    </div>
  );
}
