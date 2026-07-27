"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createAiJobAction } from "@/app/(app)/ai/actions";

type Scope = "SINGLE_LEAD" | "SELECTED_LEADS" | "FILTERED_RESULTS" | "IMPORT_BATCH" | "SAVED_SEGMENT";
type JobType = "CLASSIFICATION" | "SCORING" | "RECOMMENDATIONS" | "OUTREACH" | "FULL_ANALYSIS";

export function AiJobForm({
  scope,
  count,
  businessRecordIds,
  importBatchId,
  savedSegmentId,
  filters,
  costPerInputMTok,
  costPerOutputMTok,
  model,
}: {
  scope: Scope;
  count: number;
  businessRecordIds?: string[];
  importBatchId?: string;
  savedSegmentId?: string;
  filters?: Record<string, string>;
  costPerInputMTok: number;
  costPerOutputMTok: number;
  model: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [jobType, setJobType] = useState<JobType>("FULL_ANALYSIS");
  const [generateDrafts, setGenerateDrafts] = useState(false);
  const [skipFresh, setSkipFresh] = useState(true);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [reviewThreshold, setReviewThreshold] = useState("60");
  const [maxLeads, setMaxLeads] = useState("");

  const estimate = useMemo(() => {
    const effective = maxLeads ? Math.min(count, Number(maxLeads) || count) : count;
    const drafts = generateDrafts || jobType === "OUTREACH";
    const calls = effective * (1 + (drafts ? 4 : 0));
    const inTok = effective * (1000 + (drafts ? 2400 : 0));
    const outTok = effective * (500 + (drafts ? 2400 : 0));
    const cents = costPerInputMTok > 0 || costPerOutputMTok > 0
      ? Math.round((inTok / 1_000_000) * costPerInputMTok + (outTok / 1_000_000) * costPerOutputMTok)
      : null;
    return { effective, calls, inTok, outTok, cents };
  }, [count, maxLeads, generateDrafts, jobType, costPerInputMTok, costPerOutputMTok]);

  function submit() {
    startTransition(async () => {
      const r = await createAiJobAction({
        scope, businessRecordIds, importBatchId, savedSegmentId, filters,
        jobType, generateDrafts, skipFresh, forceRefresh,
        reviewThreshold: Number(reviewThreshold) || 60,
        maxLeads: maxLeads ? Number(maxLeads) : null,
      });
      if (r.ok) { toast(r.message ?? "Queued.", "success"); router.push("/ai"); }
      else toast(r.error ?? "Could not start job.", "error");
    });
  }

  const selectClass = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="jobType">Analysis type</Label>
          <select id="jobType" className={selectClass} value={jobType} onChange={(e) => setJobType(e.target.value as JobType)}>
            <option value="CLASSIFICATION">Classification only</option>
            <option value="SCORING">Lead scoring only</option>
            <option value="RECOMMENDATIONS">Service recommendations only</option>
            <option value="FULL_ANALYSIS">Full analysis</option>
            <option value="OUTREACH">Generate outreach drafts</option>
          </select>
        </div>
        <div>
          <Label htmlFor="maxLeads">Max leads</Label>
          <Input id="maxLeads" type="number" min={1} value={maxLeads} placeholder={String(count)} onChange={(e) => setMaxLeads(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="reviewThreshold">Review below confidence</Label>
          <Input id="reviewThreshold" type="number" min={0} max={100} value={reviewThreshold} onChange={(e) => setReviewThreshold(e.target.value)} />
        </div>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={generateDrafts} onChange={(e) => setGenerateDrafts(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />Generate outreach drafts</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={skipFresh} onChange={(e) => setSkipFresh(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />Skip fresh analyses</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={forceRefresh} onChange={(e) => setForceRefresh(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />Force refresh</label>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="mb-2 font-semibold text-slate-900">Estimate</h3>
        <ul className="space-y-1 text-slate-600">
          <li>Leads selected: <strong>{estimate.effective.toLocaleString()}</strong></li>
          <li>Model: <strong>{model}</strong></li>
          <li>Expected model calls: <strong>{estimate.calls.toLocaleString()}</strong></li>
          <li>Estimated tokens: <strong>{(estimate.inTok + estimate.outTok).toLocaleString()}</strong> ({estimate.inTok.toLocaleString()} in / {estimate.outTok.toLocaleString()} out)</li>
          <li>Estimated cost: <strong>{estimate.cents != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(estimate.cents / 100) : "unknown (shows token counts)"}</strong></li>
        </ul>
        <p className="mt-2 text-xs text-slate-400">Estimates are approximate; actual cost/time may differ.</p>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push("/ai")}>Cancel</Button>
        <Button
          disabled={count === 0}
          loading={isPending}
          onClick={() => { if (window.confirm(`Run AI analysis on ~${estimate.effective} lead(s)? This may incur paid API usage.`)) submit(); }}
        >
          Confirm &amp; start
        </Button>
      </div>
    </div>
  );
}
