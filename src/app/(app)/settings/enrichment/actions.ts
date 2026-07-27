"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError, isAdmin } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";

export type SettingsActionResult = { ok: boolean; error?: string; message?: string };

const settingsSchema = z.object({
  dailyLeadLimit: z.number().int().min(1).max(100000),
  maxLeadsPerJob: z.number().int().min(1).max(10000),
  cacheDays: z.number().int().min(1).max(365),
  retryLimit: z.number().int().min(0).max(10),
  reviewConfidenceThreshold: z.number().int().min(0).max(100),
  websiteCrawlEnabled: z.boolean(),
  websitePageLimit: z.number().int().min(1).max(50),
  requestTimeoutMs: z.number().int().min(1000).max(120000),
  costCeilingCents: z.number().int().min(0),
});

export async function updateEnrichmentSettings(
  input: z.infer<typeof settingsSchema>,
): Promise<SettingsActionResult> {
  try {
    const user = await requireUser();
    if (!isAdmin(user)) {
      throw new AuthzError("Only administrators can change enrichment settings.");
    }
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    await prisma.enrichmentSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...parsed.data, updatedById: user.id },
      update: { ...parsed.data, updatedById: user.id },
    });
    await recordAudit({
      userId: user.id,
      action: "enrichment.settings.changed",
      entityType: "EnrichmentSettings",
      entityId: "singleton",
    });
    revalidatePath("/settings/enrichment");
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message };
    console.error("[enrichment.settings] failed", error instanceof Error ? error.message : "?");
    return { ok: false, error: "Could not save settings." };
  }
}
