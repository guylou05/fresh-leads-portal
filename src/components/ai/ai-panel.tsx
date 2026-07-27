"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";
import {
  analyzeSingleLeadAction,
  approveAnalysisAction,
  rejectAnalysisAction,
  applyPriorityRecommendationAction,
  applyQualificationRecommendationAction,
  generateDraftsAction,
  markAnalysisStaleAction,
  editDraftAction,
  setDraftStatusAction,
  type AiActionResult,
} from "@/app/(app)/ai/actions";

export type AiEvidence = { field: string; value: string; sourceType: string; relevance: string };
export type AiService = { service: string; priority: string; confidence: number; rationale: string };
export type AiAngle = { angle: string; why: string; confidence: number; cta: string };

export type AiAnalysisView = {
  id: string;
  status: string;
  industry: string | null;
  industryConfidence: number | null;
  businessType: string | null;
  segment: string | null;
  segmentConfidence: number | null;
  leadScore: number | null;
  subScores: Record<string, number> | null;
  leadScoreExplanation: string | null;
  priorityRecommendation: string | null;
  qualificationRecommendation: string | null;
  qualificationReason: string | null;
  recommendedServices: AiService[];
  outreachAngles: AiAngle[];
  evidence: AiEvidence[];
  warnings: string[];
  promptVersion: string;
  model: string;
  lastAnalyzedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
};

export type AiDraftView = {
  id: string;
  draftType: string;
  tone: string;
  subject: string | null;
  body: string;
  callToAction: string | null;
  status: string;
  model: string;
};

const SOURCE_TONE: Record<string, "neutral" | "success" | "warning" | "brand"> = {
  official_filing: "neutral",
  verified_enrichment: "success",
  manual_user: "brand",
  ai_inference: "warning",
};

export function AiPanel({
  businessRecordId,
  analysis,
  drafts,
  isStale,
}: {
  businessRecordId: string;
  analysis: AiAnalysisView | null;
  drafts: AiDraftView[];
  isStale: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");

  function run(fn: () => Promise<AiActionResult>) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) { toast(r.message ?? "Done.", "success"); router.refresh(); }
      else toast(r.error ?? "Action failed.", "error");
    });
  }

  if (!analysis) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          No AI analysis yet. AI produces evidence-based <strong>recommendations</strong> (never facts)
          from official filing, verified enrichment, and your manual data.
        </p>
        <Button loading={isPending} onClick={() => run(() => analyzeSingleLeadAction(businessRecordId, { generateDrafts: false, forceRefresh: false }))}>
          Run AI analysis
        </Button>
      </div>
    );
  }

  const confBadge = (c: number | null) =>
    c == null ? null : <Badge tone={c >= 80 ? "success" : c >= 60 ? "warning" : "danger"}>Confidence {c}</Badge>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={analysis.status === "APPROVED" ? "success" : analysis.status === "REJECTED" ? "danger" : analysis.status === "NEEDS_REVIEW" ? "warning" : "brand"}>
          {analysis.status.replace(/_/g, " ").toLowerCase()}
        </Badge>
        {isStale && <Badge tone="warning">Stale (source data changed)</Badge>}
        <span className="text-xs text-slate-400">
          {analysis.model} · prompt {analysis.promptVersion} · {formatDateTime(analysis.lastAnalyzedAt)}
        </span>
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        AI outputs are recommendations, not facts. Nothing is applied to the lead
        without your confirmation.
      </p>

      {/* Classification + score */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Industry</p>
          <p className="mt-1 font-medium text-slate-900">{analysis.industry ?? "—"}</p>
          <div className="mt-1">{confBadge(analysis.industryConfidence)}</div>
          <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">Business type</p>
          <p className="text-sm text-slate-700">{analysis.businessType ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Segment</p>
          <p className="mt-1 font-medium text-slate-900">{analysis.segment ?? "—"}</p>
          <div className="mt-1">{confBadge(analysis.segmentConfidence)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Lead score</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{analysis.leadScore ?? "—"}</p>
          {analysis.subScores && (
            <p className="mt-1 text-xs text-slate-500">
              {Object.entries(analysis.subScores).map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </p>
          )}
          {analysis.leadScoreExplanation && <p className="mt-1 text-xs text-slate-400">{analysis.leadScoreExplanation}</p>}
        </div>
      </div>

      {/* Recommendations to apply */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <span className="text-sm text-slate-600">Recommended priority: <strong>{analysis.priorityRecommendation ?? "—"}</strong></span>
        <Button size="sm" variant="secondary" loading={isPending} onClick={() => run(() => applyPriorityRecommendationAction(analysis.id))}>Apply priority</Button>
        <span className="ml-4 text-sm text-slate-600">Qualification: <strong>{analysis.qualificationRecommendation ?? "—"}</strong></span>
        {(analysis.qualificationRecommendation === "QUALIFY" || analysis.qualificationRecommendation === "DISQUALIFY") && (
          <Button size="sm" variant="secondary" loading={isPending} onClick={() => run(() => applyQualificationRecommendationAction(analysis.id))}>Apply qualification</Button>
        )}
      </div>
      {analysis.qualificationReason && <p className="text-sm text-slate-500">Reason: {analysis.qualificationReason}</p>}

      {/* Services */}
      {analysis.recommendedServices.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Recommended services</h4>
          <ul className="space-y-1 text-sm">
            {analysis.recommendedServices.map((s) => (
              <li key={s.service} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5">
                <span className="text-slate-800">{s.service} <span className="text-xs text-slate-400">({s.priority.toLowerCase()})</span></span>
                <span className="text-xs text-slate-500">conf {s.confidence} · {s.rationale}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Outreach angles */}
      {analysis.outreachAngles.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Outreach angles</h4>
          <ul className="space-y-1 text-sm text-slate-700">
            {analysis.outreachAngles.map((a) => (
              <li key={a.angle} className="rounded border border-slate-200 px-3 py-1.5">
                <span className="font-medium">{a.angle}</span> — {a.why} <span className="text-xs text-slate-400">(conf {a.confidence}; CTA: {a.cta})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence (source-labeled) */}
      {analysis.evidence.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Evidence</h4>
          <ul className="space-y-1 text-xs">
            {analysis.evidence.map((e, i) => (
              <li key={`${e.field}-${i}`} className="flex flex-wrap items-center gap-2">
                <Badge tone={SOURCE_TONE[e.sourceType] ?? "neutral"}>{e.sourceType.replace(/_/g, " ")}</Badge>
                <span className="font-medium text-slate-700">{e.field}:</span>
                <span className="text-slate-600">{e.value}</span>
                <span className="text-slate-400">— {e.relevance}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {analysis.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Warnings</p>
          <ul className="mt-1 list-disc pl-5">
            {analysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Analysis actions */}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" loading={isPending} onClick={() => run(() => analyzeSingleLeadAction(businessRecordId, { forceRefresh: true }))}>Rerun analysis</Button>
        <Button variant="secondary" loading={isPending} onClick={() => run(() => generateDraftsAction(businessRecordId))}>Generate outreach drafts</Button>
        {analysis.status !== "APPROVED" && <Button loading={isPending} onClick={() => run(() => approveAnalysisAction(analysis.id))}>Approve</Button>}
        {!rejecting ? (
          <Button variant="danger" onClick={() => setRejecting(true)}>Reject</Button>
        ) : (
          <span className="flex items-center gap-2">
            <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason" className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
            <Button variant="danger" size="sm" loading={isPending} onClick={() => { run(() => rejectAnalysisAction(analysis.id, rejectReason)); setRejecting(false); }}>Confirm reject</Button>
          </span>
        )}
        <Button variant="ghost" loading={isPending} onClick={() => run(() => markAnalysisStaleAction(analysis.id))}>Mark stale</Button>
      </div>

      {/* Drafts */}
      {drafts.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Outreach drafts</h4>
          <ul className="space-y-3">
            {drafts.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{d.draftType.replace(/_/g, " ").toLowerCase()} · {d.tone}</span>
                  <Badge tone={d.status === "APPROVED" ? "success" : d.status === "REJECTED" ? "danger" : "neutral"}>{d.status.toLowerCase()}</Badge>
                </div>
                {d.subject && <p className="text-sm text-slate-600">Subject: {d.subject}</p>}
                {editingDraft === d.id ? (
                  <div className="mt-1">
                    <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" loading={isPending} onClick={() => { run(() => editDraftAction({ draftId: d.id, body: draftBody })); setEditingDraft(null); }}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingDraft(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{d.body}</p>
                )}
                {d.callToAction && <p className="mt-1 text-xs text-slate-500">CTA: {d.callToAction}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => { setEditingDraft(d.id); setDraftBody(d.body); }}>Edit</button>
                  <button type="button" className="text-green-600 hover:text-green-700" onClick={() => run(() => setDraftStatusAction(d.id, "APPROVED"))}>Approve</button>
                  <button type="button" className="text-red-600 hover:text-red-700" onClick={() => run(() => setDraftStatusAction(d.id, "REJECTED"))}>Reject</button>
                  <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => run(() => setDraftStatusAction(d.id, "ARCHIVED"))}>Archive</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">Drafts are never sent automatically. Editing preserves the original generated text.</p>
        </div>
      )}
    </div>
  );
}
