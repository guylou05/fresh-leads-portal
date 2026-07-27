"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateEnrichmentSettings } from "@/app/(app)/settings/enrichment/actions";

export type SettingsView = {
  dailyLeadLimit: number;
  maxLeadsPerJob: number;
  cacheDays: number;
  retryLimit: number;
  reviewConfidenceThreshold: number;
  websiteCrawlEnabled: boolean;
  websitePageLimit: number;
  requestTimeoutMs: number;
  costCeilingCents: number;
};

export function EnrichmentSettingsForm({ initial }: { initial: SettingsView }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<SettingsView>(initial);

  function num(key: keyof SettingsView) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [key]: Number(e.target.value) }));
  }

  function save() {
    startTransition(async () => {
      const r = await updateEnrichmentSettings(form);
      if (r.ok) {
        toast(r.message ?? "Saved.", "success");
        router.refresh();
      } else toast(r.error ?? "Could not save.", "error");
    });
  }

  const numberField = (label: string, key: keyof SettingsView, min = 0) => (
    <div>
      <Label>{label}</Label>
      <Input type="number" min={min} value={String(form[key])} onChange={num(key)} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {numberField("Daily lead limit", "dailyLeadLimit", 1)}
        {numberField("Max leads per job", "maxLeadsPerJob", 1)}
        {numberField("Cache days", "cacheDays", 1)}
        {numberField("Retry limit", "retryLimit", 0)}
        {numberField("Review confidence threshold", "reviewConfidenceThreshold", 0)}
        {numberField("Website page limit", "websitePageLimit", 1)}
        {numberField("Request timeout (ms)", "requestTimeoutMs", 1000)}
        {numberField("Cost ceiling (cents, 0 = none)", "costCeilingCents", 0)}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.websiteCrawlEnabled}
          onChange={(e) => setForm((p) => ({ ...p, websiteCrawlEnabled: e.target.checked }))}
          className="h-4 w-4 rounded border-slate-300 text-brand-600"
        />
        Website crawl enabled
      </label>
      <div className="flex justify-end">
        <Button onClick={save} loading={isPending}>Save settings</Button>
      </div>
    </div>
  );
}
