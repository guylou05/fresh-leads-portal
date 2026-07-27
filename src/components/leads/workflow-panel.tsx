"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LeadPriority, LeadStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  DISQUALIFICATION_REASONS,
  FOLLOWUP_CLEAR_PROMPT_STATUSES,
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_VALUES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_VALUES,
} from "@/lib/leads/constants";
import {
  archiveLead,
  assignLead,
  clearFollowUp,
  disqualifyLead,
  qualifyLead,
  restoreLead,
  setFollowUp,
  setPriority,
  setStatus,
  updateWorkflow,
  type ActionResult,
} from "@/app/(app)/leads/actions";
import type { UserOption } from "@/components/leads/types";

const selectClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export type WorkflowInitial = {
  status: LeadStatus;
  priority: LeadPriority;
  assignedToId: string | null;
  primaryContactName: string;
  primaryContactTitle: string;
  primaryEmail: string;
  primaryPhone: string;
  website: string;
  customIndustry: string;
  estimatedValue: string;
  internalSummary: string;
  followUpAt: string;
  lastContactedAt: string;
  disqualificationReason: string | null;
};

export function WorkflowPanel({
  businessRecordId,
  initial,
  users,
}: {
  businessRecordId: string;
  initial: WorkflowInitial;
  users: UserOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);
  const [disqualifyReason, setDisqualifyReason] = useState<string>(
    DISQUALIFICATION_REASONS[0],
  );
  const [disqualifyOther, setDisqualifyOther] = useState("");
  const [showDisqualify, setShowDisqualify] = useState(false);

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast(result.message ?? "Saved.", "success");
        router.refresh();
      } else {
        toast(result.error ?? "Action failed.", "error");
      }
    });
  }

  function onStatusChange(next: LeadStatus) {
    let clearFollowUpFlag = false;
    if (FOLLOWUP_CLEAR_PROMPT_STATUSES.includes(next) && form.followUpAt) {
      clearFollowUpFlag = window.confirm(
        "This status usually ends active follow-up. Clear the existing follow-up date?",
      );
    }
    setForm((p) => ({ ...p, status: next }));
    run(() => setStatus(businessRecordId, next, { clearFollowUp: clearFollowUpFlag }));
  }

  function submitDisqualify() {
    const reason =
      disqualifyReason === "Other"
        ? disqualifyOther.trim()
        : disqualifyReason;
    if (!reason) {
      toast("Enter a disqualification reason.", "error");
      return;
    }
    run(() => disqualifyLead(businessRecordId, reason));
    setShowDisqualify(false);
  }

  function saveDetails() {
    run(() =>
      updateWorkflow(businessRecordId, {
        primaryContactName: form.primaryContactName,
        primaryContactTitle: form.primaryContactTitle,
        primaryEmail: form.primaryEmail,
        primaryPhone: form.primaryPhone,
        website: form.website,
        customIndustry: form.customIndustry,
        estimatedValue: form.estimatedValue,
        internalSummary: form.internalSummary,
        lastContactedAt: form.lastContactedAt,
      }),
    );
  }

  const isArchived = form.status === "ARCHIVED";
  const isDisqualified = form.status === "DISQUALIFIED";

  return (
    <div className="space-y-6">
      {/* Quick workflow controls */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            className={selectClass}
            value={form.status}
            onChange={(e) => onStatusChange(e.target.value as LeadStatus)}
            disabled={isPending}
          >
            {LEAD_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <select
            id="priority"
            className={selectClass}
            value={form.priority}
            onChange={(e) => {
              const next = e.target.value as LeadPriority;
              setForm((p) => ({ ...p, priority: next }));
              run(() => setPriority(businessRecordId, next));
            }}
            disabled={isPending}
          >
            {LEAD_PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>
                {LEAD_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="assignee">Assigned to</Label>
          <select
            id="assignee"
            className={selectClass}
            value={form.assignedToId ?? ""}
            onChange={(e) => {
              const next = e.target.value || null;
              setForm((p) => ({ ...p, assignedToId: next }));
              run(() => assignLead(businessRecordId, next));
            }}
            disabled={isPending}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Follow-up */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div>
          <Label htmlFor="followUp">Follow-up date &amp; time</Label>
          <Input
            id="followUp"
            type="datetime-local"
            value={form.followUpAt}
            onChange={(e) => setForm((p) => ({ ...p, followUpAt: e.target.value }))}
            className="w-auto"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => run(() => setFollowUp(businessRecordId, form.followUpAt))}
          loading={isPending}
        >
          Set follow-up
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setForm((p) => ({ ...p, followUpAt: "" }));
            run(() => clearFollowUp(businessRecordId));
          }}
        >
          Clear
        </Button>
      </div>

      {/* Qualification / archive */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => run(() => qualifyLead(businessRecordId))}>
          Mark qualified
        </Button>
        {!showDisqualify ? (
          <Button variant="secondary" onClick={() => setShowDisqualify(true)}>
            Disqualify…
          </Button>
        ) : null}
        {isArchived || isDisqualified ? (
          <Button variant="secondary" onClick={() => run(() => restoreLead(businessRecordId))}>
            Restore
          </Button>
        ) : (
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm("Archive this lead? It can be restored later."))
                run(() => archiveLead(businessRecordId));
            }}
          >
            Archive
          </Button>
        )}
      </div>

      {showDisqualify && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <div>
            <Label htmlFor="dqReason">Disqualification reason</Label>
            <select
              id="dqReason"
              className={selectClass}
              value={disqualifyReason}
              onChange={(e) => setDisqualifyReason(e.target.value)}
            >
              {DISQUALIFICATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {disqualifyReason === "Other" && (
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="dqOther">Explanation</Label>
              <Input
                id="dqOther"
                value={disqualifyOther}
                onChange={(e) => setDisqualifyOther(e.target.value)}
              />
            </div>
          )}
          <Button variant="danger" onClick={submitDisqualify} loading={isPending}>
            Confirm disqualification
          </Button>
          <Button variant="ghost" onClick={() => setShowDisqualify(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Editable sales details */}
      <div className="border-t border-slate-100 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Sales details
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Primary contact name" value={form.primaryContactName} onChange={(v) => setForm((p) => ({ ...p, primaryContactName: v }))} />
          <Field label="Contact title" value={form.primaryContactTitle} onChange={(v) => setForm((p) => ({ ...p, primaryContactTitle: v }))} />
          <Field label="Email" type="email" value={form.primaryEmail} onChange={(v) => setForm((p) => ({ ...p, primaryEmail: v }))} />
          <Field label="Phone" value={form.primaryPhone} onChange={(v) => setForm((p) => ({ ...p, primaryPhone: v }))} />
          <Field label="Website" value={form.website} onChange={(v) => setForm((p) => ({ ...p, website: v }))} placeholder="example.com" />
          <Field label="Custom industry" value={form.customIndustry} onChange={(v) => setForm((p) => ({ ...p, customIndustry: v }))} />
          <Field label="Estimated value (USD)" value={form.estimatedValue} onChange={(v) => setForm((p) => ({ ...p, estimatedValue: v }))} placeholder="2500" />
          <div>
            <Label htmlFor="lastContacted">Last contacted</Label>
            <Input id="lastContacted" type="datetime-local" value={form.lastContactedAt} onChange={(e) => setForm((p) => ({ ...p, lastContactedAt: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="summary">Internal summary</Label>
            <textarea
              id="summary"
              value={form.internalSummary}
              onChange={(e) => setForm((p) => ({ ...p, internalSummary: e.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveDetails} loading={isPending}>
            Save details
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
