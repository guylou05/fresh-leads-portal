"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { LeadRow, TagOption, UserOption } from "@/components/leads/types";
import { PriorityBadge, StatusBadge, TagChip } from "@/components/leads/badges";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  LEAD_PRIORITY_VALUES,
  LEAD_STATUS_VALUES,
  LEAD_PRIORITY_LABELS,
  LEAD_STATUS_LABELS,
  PAGE_SIZE_OPTIONS,
} from "@/lib/leads/constants";
import {
  qualifyLead,
  archiveLead,
  restoreLead,
} from "@/app/(app)/leads/actions";
import { bulkUpdateLeads } from "@/app/(app)/leads/bulk";
import type { BulkAction } from "@/lib/leads/bulk-actions";

type ColumnKey =
  | "effectiveDate"
  | "entityType"
  | "city"
  | "county"
  | "assigned"
  | "tags"
  | "contact"
  | "email"
  | "phone"
  | "followUp"
  | "updated";

const OPTIONAL_COLUMNS: { key: ColumnKey; label: string; default: boolean }[] = [
  { key: "effectiveDate", label: "Effective date", default: true },
  { key: "city", label: "City", default: true },
  { key: "county", label: "County", default: true },
  { key: "entityType", label: "Entity type", default: false },
  { key: "assigned", label: "Assigned", default: true },
  { key: "tags", label: "Tags", default: true },
  { key: "contact", label: "Primary contact", default: false },
  { key: "email", label: "Email", default: false },
  { key: "phone", label: "Phone", default: false },
  { key: "followUp", label: "Follow-up", default: true },
  { key: "updated", label: "Last updated", default: true },
];

const STORAGE_KEY = "freshbiz.leads.columns";

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}
function fmtDateTime(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "—";
}

export function LeadsTable({
  rows,
  users,
  tags,
  total,
  page,
  pageSize,
  totalPages,
}: {
  rows: LeadRow[];
  users: UserOption[];
  tags: TagOption[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState<Set<ColumnKey>>(
    () => new Set(OPTIONAL_COLUMNS.filter((c) => c.default).map((c) => c.key)),
  );
  const [bulkAction, setBulkAction] = useState<BulkAction | "">("");
  const [bulkValue, setBulkValue] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setVisible(new Set(JSON.parse(stored) as ColumnKey[]));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleColumn(key: ColumnKey) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const show = (key: ColumnKey) => visible.has(key);

  function updateParam(updates: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") sp.delete(key);
      else sp.set(key, value);
    }
    router.push(`/leads?${sp.toString()}`);
  }

  const allOnPageSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.businessRecordId));

  function toggleAll() {
    setSelected(() => {
      if (allOnPageSelected) return new Set();
      return new Set(rows.map((r) => r.businessRecordId));
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedIds = useMemo(() => [...selected], [selected]);

  function runRowAction(
    label: string,
    fn: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast(result.message ?? `${label} done.`, "success");
      else toast(result.error ?? "Action failed.", "error");
    });
  }

  function runBulk() {
    if (!bulkAction || selectedIds.length === 0) return;
    const needsValue = [
      "status",
      "priority",
      "assign",
      "addTag",
      "removeTag",
      "setFollowUp",
      "disqualify",
    ].includes(bulkAction);
    if (needsValue && !bulkValue) {
      toast("Choose a value for the bulk action.", "error");
      return;
    }
    const destructive = bulkAction === "archive" || bulkAction === "disqualify";
    if (
      destructive &&
      !window.confirm(
        `Apply "${bulkAction}" to ${selectedIds.length} lead(s)? This can be undone by restoring.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateLeads({
        action: bulkAction,
        ids: selectedIds,
        expectedCount: selectedIds.length,
        value: bulkValue || undefined,
        confirmed: destructive ? true : undefined,
      });
      if (result.ok) {
        toast(result.message ?? "Bulk update applied.", "success");
        setSelected(new Set());
        setBulkAction("");
        setBulkValue("");
        router.refresh();
      } else {
        toast(result.error ?? "Bulk update failed.", "error");
      }
    });
  }

  const selectClass =
    "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          {total.toLocaleString()} lead{total === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Per page</label>
          <select
            className={selectClass}
            value={pageSize}
            onChange={(e) => updateParam({ pageSize: e.target.value, page: "1" })}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
              Columns
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-card">
              {OPTIONAL_COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={show(c.key)}
                    onChange={() => toggleColumn(c.key)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </details>
        </div>
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <span className="text-sm font-medium text-brand-800">
            {selectedIds.length} selected
          </span>
          <select
            className={selectClass}
            value={bulkAction}
            onChange={(e) => {
              setBulkAction(e.target.value as BulkAction | "");
              setBulkValue("");
            }}
            aria-label="Bulk action"
          >
            <option value="">Choose action…</option>
            <option value="status">Set status</option>
            <option value="priority">Set priority</option>
            <option value="assign">Assign to</option>
            <option value="unassign">Remove assignment</option>
            <option value="addTag">Add tag</option>
            <option value="removeTag">Remove tag</option>
            <option value="setFollowUp">Set follow-up</option>
            <option value="clearFollowUp">Clear follow-up</option>
            <option value="qualify">Mark qualified</option>
            <option value="disqualify">Mark disqualified</option>
            <option value="archive">Archive</option>
            <option value="restore">Restore</option>
          </select>

          {bulkAction === "status" && (
            <select className={selectClass} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
              <option value="">Status…</option>
              {LEAD_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          )}
          {bulkAction === "priority" && (
            <select className={selectClass} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
              <option value="">Priority…</option>
              {LEAD_PRIORITY_VALUES.map((p) => (
                <option key={p} value={p}>
                  {LEAD_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          )}
          {bulkAction === "assign" && (
            <select className={selectClass} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
              <option value="">User…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          {(bulkAction === "addTag" || bulkAction === "removeTag") && (
            <select className={selectClass} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
              <option value="">Tag…</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {bulkAction === "setFollowUp" && (
            <input
              type="datetime-local"
              className={selectClass}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            />
          )}
          {bulkAction === "disqualify" && (
            <input
              type="text"
              placeholder="Reason (required)"
              className={selectClass}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            />
          )}

          <Button size="sm" onClick={runBulk} loading={isPending}>
            Apply
          </Button>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
              </th>
              <th className="px-3 py-3 font-medium">Business name</th>
              {show("effectiveDate") && <th className="px-3 py-3 font-medium">Effective</th>}
              {show("entityType") && <th className="px-3 py-3 font-medium">Type</th>}
              {show("city") && <th className="px-3 py-3 font-medium">City</th>}
              {show("county") && <th className="px-3 py-3 font-medium">County</th>}
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Priority</th>
              {show("assigned") && <th className="px-3 py-3 font-medium">Assigned</th>}
              {show("tags") && <th className="px-3 py-3 font-medium">Tags</th>}
              {show("contact") && <th className="px-3 py-3 font-medium">Contact</th>}
              {show("email") && <th className="px-3 py-3 font-medium">Email</th>}
              {show("phone") && <th className="px-3 py-3 font-medium">Phone</th>}
              {show("followUp") && <th className="px-3 py-3 font-medium">Follow-up</th>}
              {show("updated") && <th className="px-3 py-3 font-medium">Updated</th>}
              <th className="px-3 py-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const overdue =
                r.followUpAt !== null && new Date(r.followUpAt) < new Date();
              return (
                <tr key={r.businessRecordId} className="hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.businessName}`}
                      checked={selected.has(r.businessRecordId)}
                      onChange={() => toggleOne(r.businessRecordId)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                  </td>
                  <td className="max-w-[220px] px-3 py-3">
                    <Link
                      href={`/leads/${r.businessRecordId}`}
                      className="block truncate font-medium text-slate-900 hover:text-brand-700"
                    >
                      {r.businessName}
                    </Link>
                  </td>
                  {show("effectiveDate") && (
                    <td className="px-3 py-3 text-slate-600">{fmtDate(r.effectiveDate)}</td>
                  )}
                  {show("entityType") && (
                    <td className="px-3 py-3 text-slate-600">{r.entityType ?? "—"}</td>
                  )}
                  {show("city") && (
                    <td className="px-3 py-3 text-slate-600">{r.businessCity ?? "—"}</td>
                  )}
                  {show("county") && (
                    <td className="px-3 py-3 text-slate-600">{r.county ?? "—"}</td>
                  )}
                  <td className="px-3 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-3">
                    <PriorityBadge priority={r.priority} />
                  </td>
                  {show("assigned") && (
                    <td className="px-3 py-3 text-slate-600">
                      {r.assignedToName ?? <span className="text-slate-400">Unassigned</span>}
                    </td>
                  )}
                  {show("tags") && (
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.tags.slice(0, 3).map((t) => (
                          <TagChip key={t.id} name={t.name} color={t.color} />
                        ))}
                        {r.tags.length > 3 && (
                          <span className="text-xs text-slate-400">
                            +{r.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  {show("contact") && (
                    <td className="px-3 py-3 text-slate-600">
                      {r.primaryContactName ?? "—"}
                    </td>
                  )}
                  {show("email") && (
                    <td className="px-3 py-3 text-slate-600">{r.primaryEmail ?? "—"}</td>
                  )}
                  {show("phone") && (
                    <td className="px-3 py-3 text-slate-600">{r.primaryPhone ?? "—"}</td>
                  )}
                  {show("followUp") && (
                    <td className={`px-3 py-3 ${overdue ? "font-medium text-red-600" : "text-slate-600"}`}>
                      {fmtDateTime(r.followUpAt)}
                    </td>
                  )}
                  {show("updated") && (
                    <td className="px-3 py-3 text-xs text-slate-500">{fmtDate(r.updatedAt)}</td>
                  )}
                  <td className="px-3 py-3 text-right">
                    <details className="relative inline-block text-left">
                      <summary className="inline-flex cursor-pointer list-none items-center rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">
                        ⋯
                      </summary>
                      <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-card">
                        <Link
                          href={`/leads/${r.businessRecordId}`}
                          className="block px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                        >
                          View / edit
                        </Link>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                          onClick={() =>
                            runRowAction("Qualified", () =>
                              qualifyLead(r.businessRecordId),
                            )
                          }
                        >
                          Mark qualified
                        </button>
                        {r.status === "ARCHIVED" ? (
                          <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              runRowAction("Restored", () =>
                                restoreLead(r.businessRecordId),
                              )
                            }
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              runRowAction("Archived", () =>
                                archiveLead(r.businessRecordId),
                              )
                            }
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => updateParam({ page: String(page - 1) })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => updateParam({ page: String(page + 1) })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
