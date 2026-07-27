"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateAiSettings } from "@/app/(app)/settings/ai/actions";

export type AiSettingsView = {
  classificationModel: string;
  outreachModel: string;
  dailyLeadLimit: number;
  maxBatchSize: number;
  retryLimit: number;
  reviewConfidenceThreshold: number;
  costCeilingCents: number;
  promptVersion: string;
  aiEnabled: boolean;
};

export function AiSettingsForm({ initial }: { initial: AiSettingsView }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<AiSettingsView>(initial);

  const text = (key: keyof AiSettingsView) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const num = (key: keyof AiSettingsView) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [key]: Number(e.target.value) }));

  function save() {
    startTransition(async () => {
      const r = await updateAiSettings(form);
      if (r.ok) { toast(r.message ?? "Saved.", "success"); router.refresh(); }
      else toast(r.error ?? "Could not save.", "error");
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><Label>Classification model</Label><Input value={form.classificationModel} onChange={text("classificationModel")} /></div>
        <div><Label>Outreach model</Label><Input value={form.outreachModel} onChange={text("outreachModel")} /></div>
        <div><Label>Daily lead limit</Label><Input type="number" min={1} value={String(form.dailyLeadLimit)} onChange={num("dailyLeadLimit")} /></div>
        <div><Label>Max batch size</Label><Input type="number" min={1} value={String(form.maxBatchSize)} onChange={num("maxBatchSize")} /></div>
        <div><Label>Retry limit</Label><Input type="number" min={0} value={String(form.retryLimit)} onChange={num("retryLimit")} /></div>
        <div><Label>Review confidence threshold</Label><Input type="number" min={0} max={100} value={String(form.reviewConfidenceThreshold)} onChange={num("reviewConfidenceThreshold")} /></div>
        <div><Label>Cost ceiling (cents)</Label><Input type="number" min={0} value={String(form.costCeilingCents)} onChange={num("costCeilingCents")} /></div>
        <div><Label>Prompt version</Label><Input value={form.promptVersion} onChange={text("promptVersion")} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.aiEnabled} onChange={(e) => setForm((p) => ({ ...p, aiEnabled: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
        AI features enabled
      </label>
      <div className="flex justify-end"><Button onClick={save} loading={isPending}>Save AI settings</Button></div>
    </div>
  );
}
