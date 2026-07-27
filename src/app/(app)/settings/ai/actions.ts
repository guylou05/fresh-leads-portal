"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError, isAdmin } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";

export type AiSettingsResult = { ok: boolean; error?: string; message?: string };

const schema = z.object({
  classificationModel: z.string().trim().min(1).max(100),
  outreachModel: z.string().trim().min(1).max(100),
  dailyLeadLimit: z.number().int().min(1).max(100000),
  maxBatchSize: z.number().int().min(1).max(10000),
  retryLimit: z.number().int().min(0).max(10),
  reviewConfidenceThreshold: z.number().int().min(0).max(100),
  costCeilingCents: z.number().int().min(0),
  promptVersion: z.string().trim().min(1).max(20),
  aiEnabled: z.boolean(),
});

export async function updateAiSettings(input: z.infer<typeof schema>): Promise<AiSettingsResult> {
  try {
    const user = await requireUser();
    if (!isAdmin(user)) throw new AuthzError("Only administrators can change AI settings.");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    await prisma.aiSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...parsed.data, updatedById: user.id },
      update: { ...parsed.data, updatedById: user.id },
    });
    await recordAudit({ userId: user.id, action: "ai.settings.changed", entityType: "AiSettings", entityId: "singleton" });
    revalidatePath("/settings/ai");
    return { ok: true, message: "AI settings saved." };
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message };
    console.error("[ai.settings] failed", error instanceof Error ? error.message : "?");
    return { ok: false, error: "Could not save settings." };
  }
}
