"use server";

import { revalidatePath } from "next/cache";
import type { LeadPriority, LeadStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { getOrCreateProfile } from "@/lib/leads/profile";
import { recordActivity } from "@/lib/leads/activity";
import { assertCanReceiveAssignment } from "@/lib/leads/permissions";
import {
  assertCanBulkUpdate,
  assertConfirmationCount,
  bulkActionSchema,
  requiresConfirmation,
  type BulkActionInput,
} from "@/lib/leads/bulk-actions";
import {
  LEAD_PRIORITY_VALUES,
  LEAD_STATUS_VALUES,
} from "@/lib/leads/constants";
import { parseFollowUpDate } from "@/lib/leads/validation";

export type BulkResult = {
  ok: boolean;
  error?: string;
  message?: string;
  affected?: number;
};

export async function bulkUpdateLeads(
  input: BulkActionInput,
): Promise<BulkResult> {
  try {
    const user = await requireUser();
    assertCanBulkUpdate(user);

    const parsed = bulkActionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
    }
    const { action, ids, expectedCount, value, confirmed } = parsed.data;

    assertConfirmationCount(ids, expectedCount);
    if (requiresConfirmation(action) && !confirmed) {
      return { ok: false, error: "This action requires confirmation." };
    }

    // Validate the payload value once, up front.
    let assignTargetName: string | null = null;
    if (action === "status" && !LEAD_STATUS_VALUES.includes(value as LeadStatus)) {
      return { ok: false, error: "Invalid status." };
    }
    if (action === "priority" && !LEAD_PRIORITY_VALUES.includes(value as LeadPriority)) {
      return { ok: false, error: "Invalid priority." };
    }
    if (action === "assign") {
      if (!value) return { ok: false, error: "Choose a user to assign." };
      const target = await prisma.user.findUnique({ where: { id: value } });
      if (!target) return { ok: false, error: "User not found." };
      assertCanReceiveAssignment(target);
      assignTargetName = target.name;
    }
    let followUpDate: Date | null = null;
    if (action === "setFollowUp") {
      const parsedDate = parseFollowUpDate(value);
      if (!parsedDate.ok || !parsedDate.date)
        return { ok: false, error: "Enter a valid follow-up date." };
      followUpDate = parsedDate.date;
    }
    if (action === "disqualify" && !value?.trim()) {
      return { ok: false, error: "A disqualification reason is required." };
    }

    await prisma.$transaction(async (tx) => {
      for (const businessRecordId of ids) {
        const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
        const data: Prisma.LeadProfileUpdateInput = { updatedBy: { connect: { id: user.id } } };
        let title = "Bulk update applied";

        switch (action) {
          case "status":
            data.status = value as LeadStatus;
            title = `Bulk: status set to ${value}`;
            break;
          case "priority":
            data.priority = value as LeadPriority;
            title = `Bulk: priority set to ${value}`;
            break;
          case "assign":
            data.assignedTo = { connect: { id: value as string } };
            title = `Bulk: assigned to ${assignTargetName}`;
            break;
          case "unassign":
            data.assignedTo = { disconnect: true };
            title = "Bulk: assignment removed";
            break;
          case "setFollowUp":
            data.followUpAt = followUpDate;
            title = "Bulk: follow-up set";
            break;
          case "clearFollowUp":
            data.followUpAt = null;
            title = "Bulk: follow-up cleared";
            break;
          case "archive":
            if (profile.status !== "ARCHIVED") {
              data.status = "ARCHIVED";
              data.archivedAt = new Date();
              data.preArchiveStatus = profile.status;
            }
            title = "Bulk: archived";
            break;
          case "restore":
            data.status = profile.preArchiveStatus ?? "REVIEWING";
            data.archivedAt = null;
            data.preArchiveStatus = null;
            title = "Bulk: restored";
            break;
          case "qualify":
            data.status = "QUALIFIED";
            data.qualifiedAt = new Date();
            title = "Bulk: qualified";
            break;
          case "disqualify":
            data.status = "DISQUALIFIED";
            data.disqualifiedAt = new Date();
            data.disqualificationReason = value?.trim().slice(0, 500);
            title = "Bulk: disqualified";
            break;
          case "addTag":
            if (value) {
              await tx.leadTag
                .create({
                  data: { leadProfileId: profile.id, tagId: value, addedById: user.id },
                })
                .catch(() => {
                  /* already tagged (unique) — ignore */
                });
              title = "Bulk: tag added";
            }
            break;
          case "removeTag":
            if (value) {
              await tx.leadTag.deleteMany({
                where: { leadProfileId: profile.id, tagId: value },
              });
              title = "Bulk: tag removed";
            }
            break;
        }

        await tx.leadProfile.update({ where: { id: profile.id }, data });
        await recordActivity(tx, {
          leadProfileId: profile.id,
          actorId: user.id,
          activityType: "BULK_UPDATED",
          title,
        });
      }
    });

    await recordAudit({
      userId: user.id,
      action: "lead.bulk",
      entityType: "BusinessRecord",
      metadata: { action, count: ids.length },
    });

    revalidatePath("/leads");
    revalidatePath("/dashboard");
    revalidatePath("/leads/follow-ups");
    return { ok: true, message: `Updated ${ids.length} lead(s).`, affected: ids.length };
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message };
    console.error(
      "[leads.bulk] failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return { ok: false, error: "Bulk update failed. No changes were applied." };
  }
}
