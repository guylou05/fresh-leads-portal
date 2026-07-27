"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  createEnrichmentJobAction,
  type CreateJobInput,
} from "@/app/(app)/enrichment/actions";
import type { EnrichmentOperations } from "@/lib/enrichment/types";

const OP_LABELS: { key: keyof EnrichmentOperations; label: string }[] = [
  { key: "googlePlaces", label: "Google Places lookup" },
  { key: "websiteDiscovery", label: "Website discovery" },
  { key: "websiteCrawl", label: "Website crawl" },
  { key: "phone", label: "Public phone extraction" },
  { key: "email", label: "Public email extraction" },
  { key: "social", label: "Social-link extraction" },
];

export function EnrichmentJobForm({
  scope,
  count,
  businessRecordIds,
  importBatchId,
  filters,
  costPerCallCents,
  pageLimit,
}: {
  scope: CreateJobInput["scope"];
  count: number;
  businessRecordIds?: string[];
  importBatchId?: string;
  filters?: Record<string, string>;
  costPerCallCents: number;
  pageLimit: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [ops, setOps] = useState<EnrichmentOperations>({
    googlePlaces: true,
    websiteDiscovery: true,
    websiteCrawl: true,
    phone: true,
    email: true,
    social: true,
  });
  const [skipRecent, setSkipRecent] = useState(true);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [maxLeads, setMaxLeads] = useState<string>("");
  const [reviewThreshold, setReviewThreshold] = useState("60");

  const estimate = useMemo(() => {
    const effective = maxLeads ? Math.min(count, Number(maxLeads) || count) : count;
    const googleCalls = (ops.googlePlaces ? 2 : 0) * effective;
    const websiteReq =
      ((ops.websiteDiscovery ? 1 : 0) + (ops.websiteCrawl ? pageLimit : 0)) * effective;
    const costCents = costPerCallCents > 0 ? googleCalls * costPerCallCents : null;
    return { effective, googleCalls, websiteReq, costCents };
  }, [ops, count, maxLeads, pageLimit, costPerCallCents]);

  function submit() {
    startTransition(async () => {
      const result = await createEnrichmentJobAction({
        scope,
        businessRecordIds,
        importBatchId,
        filters,
        operations: ops,
        skipRecentlyEnriched: skipRecent,
        retryFailed: false,
        maxLeads: maxLeads ? Number(maxLeads) : null,
        reviewConfidenceThreshold: Number(reviewThreshold) || 60,
        forceRefresh,
      });
      if (result.ok) {
        toast(result.message ?? "Enrichment queued.", "success");
        router.push("/enrichment");
      } else {
        toast(result.error ?? "Could not start job.", "error");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Operations</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OP_LABELS.map((op) => (
            <label key={op.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={ops[op.key]}
                onChange={(e) => setOps((p) => ({ ...p, [op.key]: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              {op.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="maxLeads">Max leads</Label>
          <Input id="maxLeads" type="number" min={1} value={maxLeads} placeholder={String(count)} onChange={(e) => setMaxLeads(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="reviewThreshold">Review below confidence</Label>
          <Input id="reviewThreshold" type="number" min={0} max={100} value={reviewThreshold} onChange={(e) => setReviewThreshold(e.target.value)} />
        </div>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={skipRecent} onChange={(e) => setSkipRecent(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Skip recently enriched
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={forceRefresh} onChange={(e) => setForceRefresh(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Force refresh (ignore cache)
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="mb-2 font-semibold text-slate-900">Estimate</h3>
        <ul className="space-y-1 text-slate-600">
          <li>Leads selected: <strong>{estimate.effective.toLocaleString()}</strong></li>
          <li>Expected Google API calls: <strong>{estimate.googleCalls.toLocaleString()}</strong></li>
          <li>Expected website requests: <strong>{estimate.websiteReq.toLocaleString()}</strong></li>
          <li>
            Estimated paid cost:{" "}
            <strong>
              {estimate.costCents != null
                ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(estimate.costCents / 100)
                : "unknown (shows request counts)"}
            </strong>
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Estimates are approximate — actual cost and time may differ.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push("/enrichment")}>Cancel</Button>
        <Button
          onClick={() => {
            if (window.confirm(`Start enrichment for ~${estimate.effective} lead(s)? This may incur paid API usage.`)) submit();
          }}
          loading={isPending}
          disabled={count === 0}
        >
          Confirm &amp; start
        </Button>
      </div>
    </div>
  );
}
