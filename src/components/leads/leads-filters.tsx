"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_VALUES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_VALUES,
} from "@/lib/leads/constants";
import { REPORT_TYPES } from "@/lib/imports/report-type";
import { FILTER_KEYS, type LeadFilters } from "@/lib/leads/query";
import { createSegment } from "@/app/(app)/segments/actions";
import type { TagOption, UserOption } from "@/components/leads/types";

const selectClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function LeadsFilters({
  values,
  users,
  tags,
  segments,
  isAdmin,
}: {
  values: LeadFilters;
  users: UserOption[];
  tags: TagOption[];
  segments: { id: string; name: string; href: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<LeadFilters>(values);
  const [saving, setSaving] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [shared, setShared] = useState(false);

  function set<K extends keyof LeadFilters>(key: K, value: string) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function apply() {
    const sp = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = state[key];
      if (v) sp.set(key, v);
    }
    router.push(`/leads?${sp.toString()}`);
  }

  function currentFilters(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of FILTER_KEYS) {
      const v = state[key];
      if (v && key !== "sort") out[key] = v;
    }
    return out;
  }

  function saveSegment() {
    if (!segmentName.trim()) {
      toast("Enter a segment name.", "error");
      return;
    }
    startTransition(async () => {
      const result = await createSegment({
        name: segmentName,
        visibility: shared ? "SHARED" : "PRIVATE",
        filters: currentFilters(),
      });
      if (result.ok) {
        toast(result.message ?? "Segment saved.", "success");
        setSaving(false);
        setSegmentName("");
        setShared(false);
      } else {
        toast(result.error ?? "Could not save segment.", "error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            value={state.q ?? ""}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Name, charter, document, contact, email, phone, website"
          />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <select id="status" className={selectClass} value={state.status ?? ""} onChange={(e) => set("status", e.target.value)}>
            <option value="">Any</option>
            {LEAD_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <select id="priority" className={selectClass} value={state.priority ?? ""} onChange={(e) => set("priority", e.target.value)}>
            <option value="">Any</option>
            {LEAD_PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>
                {LEAD_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="assignedTo">Assigned to</Label>
          <select id="assignedTo" className={selectClass} value={state.assignedTo ?? ""} onChange={(e) => set("assignedTo", e.target.value)}>
            <option value="">Any</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="tags">Tag</Label>
          <select id="tags" className={selectClass} value={state.tags ?? ""} onChange={(e) => set("tags", e.target.value)}>
            <option value="">Any</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="entityType">Entity type</Label>
          <select id="entityType" className={selectClass} value={state.entityType ?? ""} onChange={(e) => set("entityType", e.target.value)}>
            <option value="">Any</option>
            {REPORT_TYPES.filter((t) => t !== "Unknown").map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="county">County</Label>
          <Input id="county" value={state.county ?? ""} onChange={(e) => set("county", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" value={state.city ?? ""} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="followUp">Follow-up</Label>
          <select id="followUp" className={selectClass} value={state.followUp ?? ""} onChange={(e) => set("followUp", e.target.value)}>
            <option value="">Any</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="upcoming">Next 7 days</option>
          </select>
        </div>
        <div>
          <Label htmlFor="hasEmail">Email</Label>
          <select id="hasEmail" className={selectClass} value={state.hasEmail ?? ""} onChange={(e) => set("hasEmail", e.target.value)}>
            <option value="">Any</option>
            <option value="has">Has email</option>
            <option value="missing">Missing email</option>
          </select>
        </div>
        <div>
          <Label htmlFor="hasPhone">Phone</Label>
          <select id="hasPhone" className={selectClass} value={state.hasPhone ?? ""} onChange={(e) => set("hasPhone", e.target.value)}>
            <option value="">Any</option>
            <option value="has">Has phone</option>
            <option value="missing">Missing phone</option>
          </select>
        </div>
        <div>
          <Label htmlFor="hasWebsite">Website</Label>
          <select id="hasWebsite" className={selectClass} value={state.hasWebsite ?? ""} onChange={(e) => set("hasWebsite", e.target.value)}>
            <option value="">Any</option>
            <option value="has">Has website</option>
            <option value="missing">Missing website</option>
          </select>
        </div>
        <div>
          <Label htmlFor="archived">Archive</Label>
          <select id="archived" className={selectClass} value={state.archived ?? ""} onChange={(e) => set("archived", e.target.value)}>
            <option value="">Active only</option>
            <option value="only">Archived only</option>
            <option value="include">Include archived</option>
          </select>
        </div>
        <div>
          <Label htmlFor="from">Effective from</Label>
          <Input id="from" type="date" value={state.from ?? ""} onChange={(e) => set("from", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="to">Effective to</Label>
          <Input id="to" type="date" value={state.to ?? ""} onChange={(e) => set("to", e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={state.unassigned === "1"} onChange={(e) => set("unassigned", e.target.checked ? "1" : "")} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Unassigned only
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={state.qualified === "1"} onChange={(e) => set("qualified", e.target.checked ? "1" : "")} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Qualified
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={state.disqualified === "1"} onChange={(e) => set("disqualified", e.target.checked ? "1" : "")} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Disqualified
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={state.recentlyUpdated === "1"} onChange={(e) => set("recentlyUpdated", e.target.checked ? "1" : "")} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Recently updated
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={apply}>Apply filters</Button>
          <Button variant="secondary" onClick={() => router.push("/leads")}>
            Reset
          </Button>
          <Button variant="secondary" onClick={() => setSaving((v) => !v)}>
            Save as segment
          </Button>
        </div>
      </div>

      {saving && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="segmentName">Segment name</Label>
            <Input id="segmentName" value={segmentName} onChange={(e) => setSegmentName(e.target.value)} placeholder="e.g. Unassigned Cincinnati leads" />
          </div>
          {isAdmin && (
            <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              Shared
            </label>
          )}
          <Button onClick={saveSegment} loading={isPending}>
            Save segment
          </Button>
        </div>
      )}

      {segments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Saved segments
          </span>
          {segments.map((s) => (
            <a
              key={s.id}
              href={s.href}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {s.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
