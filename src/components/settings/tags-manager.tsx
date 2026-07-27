"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { TagChip } from "@/components/leads/badges";
import { TAG_COLOR_VALUES } from "@/lib/leads/constants";
import {
  createTag,
  deleteTag,
  mergeTags,
  updateTag,
  type TagActionResult,
} from "@/app/(app)/settings/tags/actions";

export type TagRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  usageCount: number;
};

const selectClass =
  "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function TagsManager({
  tags,
  isAdmin,
}: {
  tags: TagRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("slate");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("slate");
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");

  function handle(result: TagActionResult) {
    if (result.ok) {
      toast(result.message ?? "Done.", "success");
      router.refresh();
    } else toast(result.error ?? "Action failed.", "error");
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Create tag</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="tagName">Name</Label>
              <Input id="tagName" value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
            </div>
            <div>
              <Label htmlFor="tagColor">Color</Label>
              <select id="tagColor" className={selectClass} value={color} onChange={(e) => setColor(e.target.value)}>
                {TAG_COLOR_VALUES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="tagDesc">Description</Label>
              <Input id="tagDesc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <Button
              loading={isPending}
              onClick={() =>
                startTransition(async () => {
                  const r = await createTag({ name, description, color });
                  handle(r);
                  if (r.ok) {
                    setName("");
                    setDescription("");
                    setColor("slate");
                  }
                })
              }
            >
              Create
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Tag</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Usage</th>
              {isAdmin && <th className="px-4 py-3 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tags.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 4 : 3} className="px-4 py-6 text-center text-sm text-slate-400">
                  No tags yet.
                </td>
              </tr>
            ) : (
              tags.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    {editingId === t.id ? (
                      <div className="flex items-center gap-2">
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 w-40" />
                        <select className={selectClass} value={editColor} onChange={(e) => setEditColor(e.target.value)}>
                          {TAG_COLOR_VALUES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <TagChip name={t.name} color={t.color} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{t.description ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{t.usageCount}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {editingId === t.id ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            loading={isPending}
                            onClick={() =>
                              startTransition(async () => {
                                handle(
                                  await updateTag({
                                    id: t.id,
                                    name: editName,
                                    description: t.description ?? undefined,
                                    color: editColor,
                                  }),
                                );
                                setEditingId(null);
                              })
                            }
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-3 text-sm">
                          <button
                            type="button"
                            className="text-slate-500 hover:text-slate-700"
                            onClick={() => {
                              setEditingId(t.id);
                              setEditName(t.name);
                              setEditColor(t.color ?? "slate");
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => {
                              const msg =
                                t.usageCount > 0
                                  ? `"${t.name}" is used by ${t.usageCount} lead(s). Remove from all and delete?`
                                  : `Delete "${t.name}"?`;
                              if (window.confirm(msg))
                                startTransition(async () =>
                                  handle(await deleteTag({ id: t.id, force: t.usageCount > 0 })),
                                );
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && tags.length >= 2 && (
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Merge tags</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="mergeSource">Merge this tag</Label>
              <select id="mergeSource" className={selectClass} value={mergeSource} onChange={(e) => setMergeSource(e.target.value)}>
                <option value="">Select…</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="mergeTarget">Into this tag</Label>
              <select id="mergeTarget" className={selectClass} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                <option value="">Select…</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="secondary"
              loading={isPending}
              onClick={() => {
                if (!mergeSource || !mergeTarget) {
                  toast("Choose both tags to merge.", "error");
                  return;
                }
                if (window.confirm("Merge tags? The source tag will be deleted."))
                  startTransition(async () => {
                    handle(await mergeTags({ sourceId: mergeSource, targetId: mergeTarget }));
                    setMergeSource("");
                    setMergeTarget("");
                  });
              }}
            >
              Merge
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
