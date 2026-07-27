"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";
import {
  clearEnrichmentAction,
  copyToProfileAction,
  enrichSingleLeadAction,
  manualOverrideAction,
  markReviewedAction,
  type EnrichActionResult,
} from "@/app/(app)/enrichment/actions";

export type EnrichmentView = {
  status: string;
  overallConfidence: number | null;
  needsReview: boolean;
  lastEnrichedAt: string | null;
  website: { value: string | null; source: string | null; confidence: number | null; verifiedAt: string | null };
  phone: { value: string | null; source: string | null; confidence: number | null };
  email: { value: string | null; source: string | null; confidence: number | null };
  contactPageUrl: string | null;
  social: { label: string; url: string }[];
  google: { name: string | null; category: string | null; status: string | null; address: string | null };
};

export type SourceView = {
  id: string;
  fieldName: string;
  provider: string;
  sourceUrl: string | null;
  confidence: number;
  matchReason: string | null;
  retrievedAt: string;
};

function confidenceTone(c: number | null): "neutral" | "success" | "warning" | "danger" {
  if (c == null) return "neutral";
  if (c >= 80) return "success";
  if (c >= 60) return "warning";
  return "danger";
}

export function EnrichmentPanel({
  businessRecordId,
  enrichment,
  sources,
}: {
  businessRecordId: string;
  enrichment: EnrichmentView | null;
  sources: SourceView[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [override, setOverride] = useState<{ field: "website" | "phone" | "publicEmail"; value: string } | null>(null);

  function run(fn: () => Promise<EnrichActionResult>) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast(r.message ?? "Done.", "success");
        router.refresh();
      } else toast(r.error ?? "Action failed.", "error");
    });
  }

  if (!enrichment || enrichment.status === "NOT_ENRICHED") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          This lead has not been enriched yet. Enrichment discovers public
          business information (website, phone, email, social, Google match).
        </p>
        <Button loading={isPending} onClick={() => run(() => enrichSingleLeadAction(businessRecordId, true))}>
          Enrich this lead
        </Button>
      </div>
    );
  }

  const field = (
    label: string,
    data: { value: string | null; source: string | null; confidence: number | null; verifiedAt?: string | null },
    copyField?: "website" | "phone" | "email",
  ) => (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</h4>
        {data.confidence != null && (
          <Badge tone={confidenceTone(data.confidence)}>Confidence {data.confidence}</Badge>
        )}
      </div>
      <p className="mt-1 break-all text-sm font-medium text-slate-900">{data.value ?? "—"}</p>
      {data.source && <p className="mt-0.5 text-xs text-slate-500">Source: {data.source}</p>}
      {copyField && data.value && (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
          onClick={() => run(() => copyToProfileAction({ businessRecordId, field: copyField }))}
        >
          Copy to lead profile
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={enrichment.needsReview ? "warning" : "success"}>
          {enrichment.status.replace(/_/g, " ").toLowerCase()}
        </Badge>
        {enrichment.overallConfidence != null && (
          <Badge tone={confidenceTone(enrichment.overallConfidence)}>
            Overall {enrichment.overallConfidence}
          </Badge>
        )}
        {enrichment.lastEnrichedAt && (
          <span className="text-xs text-slate-400">
            Last enriched {formatDateTime(enrichment.lastEnrichedAt)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {field("Website", enrichment.website, "website")}
        {field("Public phone", enrichment.phone, "phone")}
        {field("Public email", enrichment.email, "email")}
      </div>

      {(enrichment.google.name || enrichment.social.length > 0 || enrichment.contactPageUrl) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {enrichment.google.name && (
            <div className="rounded-lg border border-slate-200 p-4 text-sm">
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Google business</h4>
              <p className="font-medium text-slate-900">{enrichment.google.name}</p>
              <p className="text-slate-600">{enrichment.google.category ?? "—"}</p>
              <p className="text-slate-500">{enrichment.google.address ?? ""}</p>
            </div>
          )}
          {(enrichment.social.length > 0 || enrichment.contactPageUrl) && (
            <div className="rounded-lg border border-slate-200 p-4 text-sm">
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Links</h4>
              {enrichment.contactPageUrl && (
                <p className="break-all text-slate-700">Contact: {enrichment.contactPageUrl}</p>
              )}
              {enrichment.social.map((s) => (
                <p key={s.url} className="break-all text-slate-700">{s.label}: {s.url}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Source attribution */}
      {sources.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Source attribution</h4>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Retrieved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 text-slate-700">{s.fieldName}</td>
                    <td className="px-3 py-2 text-slate-600">{s.provider}</td>
                    <td className="px-3 py-2">{s.confidence}</td>
                    <td className="px-3 py-2 text-slate-500">{s.matchReason ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-400">{formatDateTime(s.retrievedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual override */}
      <div className="rounded-lg border border-slate-200 p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Manual correction</h4>
        <div className="flex flex-wrap items-end gap-2">
          <select
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            value={override?.field ?? "website"}
            onChange={(e) => setOverride({ field: e.target.value as "website" | "phone" | "publicEmail", value: override?.value ?? "" })}
          >
            <option value="website">Website</option>
            <option value="phone">Phone</option>
            <option value="publicEmail">Email</option>
          </select>
          <Input
            className="h-9 w-64"
            placeholder="Corrected value"
            value={override?.value ?? ""}
            onChange={(e) => setOverride({ field: override?.field ?? "website", value: e.target.value })}
          />
          <Button
            size="sm"
            variant="secondary"
            loading={isPending}
            onClick={() =>
              override &&
              run(() => manualOverrideAction({ businessRecordId, field: override.field, value: override.value }))
            }
          >
            Save override
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Manual values are labeled as overrides and are not replaced by future
          automated runs (unless you force a refresh).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={isPending} onClick={() => run(() => enrichSingleLeadAction(businessRecordId, true))}>
          Retry / refresh
        </Button>
        {enrichment.needsReview && (
          <Button variant="secondary" loading={isPending} onClick={() => run(() => markReviewedAction(businessRecordId))}>
            Mark reviewed
          </Button>
        )}
        <Button
          variant="danger"
          loading={isPending}
          onClick={() => {
            if (window.confirm("Clear all automated enrichment data for this lead?"))
              run(() => clearEnrichmentAction(businessRecordId));
          }}
        >
          Clear enrichment
        </Button>
      </div>
    </div>
  );
}
