"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  deleteSegment,
  duplicateSegment,
  updateSegment,
  type SegmentActionResult,
} from "@/app/(app)/segments/actions";

export type SegmentItem = {
  id: string;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "SHARED";
  ownerName: string;
  isOwner: boolean;
  canManage: boolean;
  href: string;
  filterCount: number;
};

export function SegmentsManager({
  segments,
  isAdmin,
}: {
  segments: SegmentItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");

  function handle(result: SegmentActionResult) {
    if (result.ok) {
      toast(result.message ?? "Done.", "success");
      router.refresh();
    } else toast(result.error ?? "Action failed.", "error");
  }

  if (segments.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No saved segments yet. Build filters on the{" "}
        <Link href="/leads" className="font-medium text-brand-600 hover:text-brand-700">
          Leads page
        </Link>{" "}
        and choose &ldquo;Save as segment&rdquo;.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {segments.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            {editing === s.id ? (
              <div className="flex items-center gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-64" />
                <Button
                  size="sm"
                  loading={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      handle(
                        await updateSegment({
                          id: s.id,
                          name,
                          visibility: s.visibility,
                        }),
                      );
                      setEditing(null);
                    })
                  }
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href={s.href}
                  className="font-medium text-slate-900 hover:text-brand-700"
                >
                  {s.name}
                </Link>
                <Badge tone={s.visibility === "SHARED" ? "brand" : "neutral"}>
                  {s.visibility === "SHARED" ? "Shared" : "Private"}
                </Badge>
                <span className="text-xs text-slate-400">
                  {s.filterCount} filter{s.filterCount === 1 ? "" : "s"} · {s.ownerName}
                </span>
              </div>
            )}
            {s.description && editing !== s.id && (
              <p className="mt-0.5 text-sm text-slate-500">{s.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={s.href}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Apply
            </Link>
            <button
              type="button"
              className="text-slate-500 hover:text-slate-700"
              onClick={() =>
                startTransition(async () => handle(await duplicateSegment({ id: s.id })))
              }
            >
              Duplicate
            </button>
            {s.canManage && (
              <>
                <button
                  type="button"
                  className="text-slate-500 hover:text-slate-700"
                  onClick={() => {
                    setEditing(s.id);
                    setName(s.name);
                  }}
                >
                  Rename
                </button>
                {(s.isOwner || isAdmin) && (
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-700"
                    onClick={() => {
                      if (window.confirm(`Delete segment "${s.name}"?`))
                        startTransition(async () =>
                          handle(await deleteSegment({ id: s.id })),
                        );
                    }}
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
