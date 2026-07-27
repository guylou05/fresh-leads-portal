"use server";

import { revalidatePath } from "next/cache";
import type { LeadPriority, LeadStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { getOrCreateProfile } from "@/lib/leads/profile";
import { recordActivity, transitionTitle } from "@/lib/leads/activity";
import { canModifyNote, assertCanReceiveAssignment } from "@/lib/leads/permissions";
import {
  LEAD_PRIORITY_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_PRIORITY_VALUES,
  LEAD_STATUS_VALUES,
} from "@/lib/leads/constants";
import {
  noteBodySchema,
  parseEstimatedValueToCents,
  parseFollowUpDate,
  normalizePhone,
  workflowFieldsSchema,
} from "@/lib/leads/validation";

export type ActionResult = { ok: boolean; error?: string; message?: string };

function ok(message?: string): ActionResult {
  return { ok: true, message };
}

function fail(error: unknown): ActionResult {
  if (error instanceof AuthzError) return { ok: false, error: error.message };
  console.error(
    "[leads.action] failed",
    error instanceof Error ? error.message : "unknown error",
  );
  return { ok: false, error: "Something went wrong. Please try again." };
}

function revalidateLead(businessRecordId: string): void {
  revalidatePath("/leads");
  revalidatePath(`/leads/${businessRecordId}`);
  revalidatePath("/leads/follow-ups");
  revalidatePath("/dashboard");
}

export async function setStatus(
  businessRecordId: string,
  status: LeadStatus,
  options: { clearFollowUp?: boolean } = {},
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!LEAD_STATUS_VALUES.includes(status)) return { ok: false, error: "Invalid status." };

    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      if (profile.status === status && !options.clearFollowUp) return;

      const shouldClearFollowUp =
        options.clearFollowUp && profile.followUpAt !== null;

      await tx.leadProfile.update({
        where: { id: profile.id },
        data: {
          status,
          updatedById: user.id,
          ...(shouldClearFollowUp ? { followUpAt: null } : {}),
        },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "STATUS_CHANGED",
        title: transitionTitle(
          "Status",
          LEAD_STATUS_LABELS[profile.status],
          LEAD_STATUS_LABELS[status],
        ),
        metadata: { from: profile.status, to: status },
      });
      if (shouldClearFollowUp) {
        await recordActivity(tx, {
          leadProfileId: profile.id,
          actorId: user.id,
          activityType: "FOLLOW_UP_CLEARED",
          title: "Follow-up cleared",
        });
      }
    });

    await recordAudit({
      userId: user.id,
      action: "lead.status.changed",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
      metadata: { to: status },
    });
    revalidateLead(businessRecordId);
    return ok("Status updated.");
  } catch (error) {
    return fail(error);
  }
}

export async function setPriority(
  businessRecordId: string,
  priority: LeadPriority,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!LEAD_PRIORITY_VALUES.includes(priority))
      return { ok: false, error: "Invalid priority." };

    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      if (profile.priority === priority) return;
      await tx.leadProfile.update({
        where: { id: profile.id },
        data: { priority, updatedById: user.id },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "PRIORITY_CHANGED",
        title: transitionTitle(
          "Priority",
          LEAD_PRIORITY_LABELS[profile.priority],
          LEAD_PRIORITY_LABELS[priority],
        ),
        metadata: { from: profile.priority, to: priority },
      });
    });
    await recordAudit({
      userId: user.id,
      action: "lead.priority.changed",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
      metadata: { to: priority },
    });
    revalidateLead(businessRecordId);
    return ok("Priority updated.");
  } catch (error) {
    return fail(error);
  }
}

export async function assignLead(
  businessRecordId: string,
  assignToId: string | null,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    let assigneeName = "Unassigned";
    if (assignToId) {
      const target = await prisma.user.findUnique({ where: { id: assignToId } });
      if (!target) return { ok: false, error: "User not found." };
      assertCanReceiveAssignment(target);
      assigneeName = target.name;
    }

    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      await tx.leadProfile.update({
        where: { id: profile.id },
        data: { assignedToId: assignToId, updatedById: user.id },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: assignToId ? "ASSIGNED" : "UNASSIGNED",
        title: assignToId ? `Assigned to ${assigneeName}` : "Assignment removed",
        metadata: { assignedToId: assignToId },
      });
    });
    await recordAudit({
      userId: user.id,
      action: "lead.assigned",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
      metadata: { assignedToId: assignToId },
    });
    revalidateLead(businessRecordId);
    return ok(assignToId ? "Lead assigned." : "Assignment removed.");
  } catch (error) {
    return fail(error);
  }
}

export async function setFollowUp(
  businessRecordId: string,
  followUpAt: string,
  note?: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = parseFollowUpDate(followUpAt);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (!parsed.date) return { ok: false, error: "Enter a follow-up date." };
    const followUpDate = parsed.date;

    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      await tx.leadProfile.update({
        where: { id: profile.id },
        data: { followUpAt: followUpDate, updatedById: user.id },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "FOLLOW_UP_SET",
        title: `Follow-up set for ${followUpDate.toISOString().slice(0, 16).replace("T", " ")} UTC`,
        description: note?.trim() ? note.trim().slice(0, 500) : null,
      });
    });
    await recordAudit({
      userId: user.id,
      action: "lead.followup.set",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
    });
    revalidateLead(businessRecordId);
    return ok("Follow-up set.");
  } catch (error) {
    return fail(error);
  }
}

export async function clearFollowUp(
  businessRecordId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      if (!profile.followUpAt) return;
      await tx.leadProfile.update({
        where: { id: profile.id },
        data: { followUpAt: null, updatedById: user.id },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "FOLLOW_UP_CLEARED",
        title: "Follow-up cleared",
      });
    });
    revalidateLead(businessRecordId);
    return ok("Follow-up cleared.");
  } catch (error) {
    return fail(error);
  }
}

export async function qualifyLead(
  businessRecordId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      await tx.leadProfile.update({
        where: { id: profile.id },
        data: {
          status: "QUALIFIED",
          qualifiedAt: new Date(),
          updatedById: user.id,
        },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "QUALIFIED",
        title: "Lead marked qualified",
      });
    });
    await recordAudit({
      userId: user.id,
      action: "lead.qualified",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
    });
    revalidateLead(businessRecordId);
    return ok("Lead qualified.");
  } catch (error) {
    return fail(error);
  }
}

export async function disqualifyLead(
  businessRecordId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const cleaned = reason.trim();
    if (!cleaned) return { ok: false, error: "A disqualification reason is required." };

    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      await tx.leadProfile.update({
        where: { id: profile.id },
        data: {
          status: "DISQUALIFIED",
          disqualifiedAt: new Date(),
          disqualificationReason: cleaned.slice(0, 500),
          updatedById: user.id,
        },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "DISQUALIFIED",
        title: "Lead marked disqualified",
        description: cleaned.slice(0, 500),
      });
    });
    await recordAudit({
      userId: user.id,
      action: "lead.disqualified",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
    });
    revalidateLead(businessRecordId);
    return ok("Lead disqualified.");
  } catch (error) {
    return fail(error);
  }
}

export async function archiveLead(
  businessRecordId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      if (profile.status === "ARCHIVED") return;
      await tx.leadProfile.update({
        where: { id: profile.id },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
          preArchiveStatus: profile.status,
          updatedById: user.id,
        },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "ARCHIVED",
        title: "Lead archived",
      });
    });
    await recordAudit({
      userId: user.id,
      action: "lead.archived",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
    });
    revalidateLead(businessRecordId);
    return ok("Lead archived.");
  } catch (error) {
    return fail(error);
  }
}

export async function restoreLead(
  businessRecordId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      const restoredStatus: LeadStatus =
        profile.status === "ARCHIVED"
          ? (profile.preArchiveStatus ?? "REVIEWING")
          : "REVIEWING";
      await tx.leadProfile.update({
        where: { id: profile.id },
        data: {
          status: restoredStatus,
          archivedAt: null,
          preArchiveStatus: null,
          disqualifiedAt: null,
          disqualificationReason: null,
          updatedById: user.id,
        },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "RESTORED",
        title: `Lead restored to ${LEAD_STATUS_LABELS[restoredStatus]}`,
      });
    });
    await recordAudit({
      userId: user.id,
      action: "lead.restored",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
    });
    revalidateLead(businessRecordId);
    return ok("Lead restored.");
  } catch (error) {
    return fail(error);
  }
}

export type WorkflowInput = {
  primaryContactName?: string;
  primaryContactTitle?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  website?: string;
  customIndustry?: string;
  internalSummary?: string;
  estimatedValue?: string;
  lastContactedAt?: string;
};

export async function updateWorkflow(
  businessRecordId: string,
  input: WorkflowInput,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = workflowFieldsSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const cents = parseEstimatedValueToCents(input.estimatedValue);
    if (!cents.ok) return { ok: false, error: cents.error };

    let lastContactedAt: Date | null | undefined;
    if (input.lastContactedAt !== undefined) {
      const parsedDate = parseFollowUpDate(input.lastContactedAt);
      if (!parsedDate.ok) return { ok: false, error: "Invalid last-contacted date." };
      lastContactedAt = parsedDate.date;
    }

    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      await tx.leadProfile.update({
        where: { id: profile.id },
        data: {
          primaryContactName: parsed.data.primaryContactName,
          primaryContactTitle: parsed.data.primaryContactTitle,
          primaryEmail: parsed.data.primaryEmail,
          primaryPhone: parsed.data.primaryPhone,
          primaryPhoneNormalized: normalizePhone(parsed.data.primaryPhone),
          website: parsed.data.website,
          customIndustry: parsed.data.customIndustry,
          internalSummary: parsed.data.internalSummary,
          estimatedValueCents: cents.cents,
          ...(lastContactedAt !== undefined ? { lastContactedAt } : {}),
          updatedById: user.id,
        },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "CONTACT_UPDATED",
        title: "Sales details updated",
      });
    });
    revalidateLead(businessRecordId);
    return ok("Details saved.");
  } catch (error) {
    return fail(error);
  }
}

export async function addTagToLead(
  businessRecordId: string,
  tagId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tag = await prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) return { ok: false, error: "Tag not found." };

    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      const existing = await tx.leadTag.findUnique({
        where: { leadProfileId_tagId: { leadProfileId: profile.id, tagId } },
      });
      if (existing) return;
      await tx.leadTag.create({
        data: { leadProfileId: profile.id, tagId, addedById: user.id },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "TAG_ADDED",
        title: `Tag "${tag.name}" added`,
        metadata: { tagId },
      });
    });
    revalidateLead(businessRecordId);
    return ok("Tag added.");
  } catch (error) {
    return fail(error);
  }
}

export async function removeTagFromLead(
  businessRecordId: string,
  tagId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const profile = await prisma.leadProfile.findUnique({
      where: { businessRecordId },
    });
    if (!profile) return ok();
    const tag = await prisma.tag.findUnique({ where: { id: tagId } });

    await prisma.$transaction(async (tx) => {
      await tx.leadTag.deleteMany({
        where: { leadProfileId: profile.id, tagId },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "TAG_REMOVED",
        title: `Tag "${tag?.name ?? "unknown"}" removed`,
        metadata: { tagId },
      });
    });
    revalidateLead(businessRecordId);
    return ok("Tag removed.");
  } catch (error) {
    return fail(error);
  }
}

export async function addNote(
  businessRecordId: string,
  body: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = noteBodySchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

    await prisma.$transaction(async (tx) => {
      const profile = await getOrCreateProfile(tx, businessRecordId, user.id);
      await tx.leadNote.create({
        data: { leadProfileId: profile.id, authorId: user.id, body: parsed.data },
      });
      await recordActivity(tx, {
        leadProfileId: profile.id,
        actorId: user.id,
        activityType: "NOTE_ADDED",
        title: "Note added",
      });
    });
    await recordAudit({
      userId: user.id,
      action: "lead.note.added",
      entityType: "BusinessRecord",
      entityId: businessRecordId,
    });
    revalidateLead(businessRecordId);
    return ok("Note added.");
  } catch (error) {
    return fail(error);
  }
}

async function loadNoteContext(noteId: string) {
  return prisma.leadNote.findUnique({
    where: { id: noteId },
    include: { leadProfile: { select: { id: true, businessRecordId: true } } },
  });
}

export async function editNote(
  noteId: string,
  body: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const note = await loadNoteContext(noteId);
    if (!note) return { ok: false, error: "Note not found." };
    if (!canModifyNote(user, note)) {
      return { ok: false, error: "You cannot edit this note." };
    }
    const parsed = noteBodySchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

    await prisma.$transaction(async (tx) => {
      await tx.leadNote.update({ where: { id: noteId }, data: { body: parsed.data } });
      await recordActivity(tx, {
        leadProfileId: note.leadProfileId,
        actorId: user.id,
        activityType: "NOTE_UPDATED",
        title: "Note updated",
      });
    });
    revalidateLead(note.leadProfile.businessRecordId);
    return ok("Note updated.");
  } catch (error) {
    return fail(error);
  }
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const note = await loadNoteContext(noteId);
    if (!note) return { ok: false, error: "Note not found." };
    if (!canModifyNote(user, note)) {
      return { ok: false, error: "You cannot delete this note." };
    }
    await prisma.$transaction(async (tx) => {
      await tx.leadNote.delete({ where: { id: noteId } });
      await recordActivity(tx, {
        leadProfileId: note.leadProfileId,
        actorId: user.id,
        activityType: "NOTE_DELETED",
        title: "Note deleted",
      });
    });
    await recordAudit({
      userId: user.id,
      action: "lead.note.deleted",
      entityType: "BusinessRecord",
      entityId: note.leadProfile.businessRecordId,
    });
    revalidateLead(note.leadProfile.businessRecordId);
    return ok("Note deleted.");
  } catch (error) {
    return fail(error);
  }
}

export async function setNotePinned(
  noteId: string,
  isPinned: boolean,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const note = await loadNoteContext(noteId);
    if (!note) return { ok: false, error: "Note not found." };
    if (!canModifyNote(user, note)) {
      return { ok: false, error: "You cannot modify this note." };
    }
    await prisma.leadNote.update({ where: { id: noteId }, data: { isPinned } });
    revalidateLead(note.leadProfile.businessRecordId);
    return ok(isPinned ? "Note pinned." : "Note unpinned.");
  } catch (error) {
    return fail(error);
  }
}
