"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import {
  canCreateSharedSegment,
  canManageSegment,
  canViewSegment,
} from "@/lib/leads/permissions";
import {
  filtersToJson,
  segmentInputSchema,
  validateSegmentFilters,
} from "@/lib/segments";

export type SegmentActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  segmentId?: string;
};

function fail(error: unknown): SegmentActionResult {
  if (error instanceof AuthzError) return { ok: false, error: error.message };
  console.error(
    "[segments.action] failed",
    error instanceof Error ? error.message : "unknown error",
  );
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createSegment(input: {
  name: string;
  description?: string;
  visibility?: "PRIVATE" | "SHARED";
  filters: Record<string, string>;
}): Promise<SegmentActionResult> {
  try {
    const user = await requireUser();
    const parsed = segmentInputSchema.safeParse({
      name: input.name,
      description: input.description,
      visibility: input.visibility ?? "PRIVATE",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    if (parsed.data.visibility === "SHARED" && !canCreateSharedSegment(user)) {
      return { ok: false, error: "Only administrators can create shared segments." };
    }
    const filters = validateSegmentFilters(input.filters);

    const segment = await prisma.savedSegment.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        visibility: parsed.data.visibility,
        filters: filtersToJson(filters),
        ownerId: user.id,
      },
    });
    if (parsed.data.visibility === "SHARED") {
      await recordAudit({
        userId: user.id,
        action: "segment.shared.created",
        entityType: "SavedSegment",
        entityId: segment.id,
        metadata: { name: segment.name },
      });
    }
    revalidatePath("/segments");
    return { ok: true, message: "Segment saved.", segmentId: segment.id };
  } catch (error) {
    return fail(error);
  }
}

export async function updateSegment(input: {
  id: string;
  name: string;
  description?: string;
  visibility?: "PRIVATE" | "SHARED";
}): Promise<SegmentActionResult> {
  try {
    const user = await requireUser();
    const segment = await prisma.savedSegment.findUnique({ where: { id: input.id } });
    if (!segment) return { ok: false, error: "Segment not found." };
    if (!canManageSegment(user, segment)) {
      return { ok: false, error: "You cannot modify this segment." };
    }
    const parsed = segmentInputSchema.safeParse({
      name: input.name,
      description: input.description,
      visibility: input.visibility ?? segment.visibility,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    if (
      parsed.data.visibility === "SHARED" &&
      segment.visibility !== "SHARED" &&
      !canCreateSharedSegment(user)
    ) {
      return { ok: false, error: "Only administrators can share segments." };
    }

    await prisma.savedSegment.update({
      where: { id: input.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        visibility: parsed.data.visibility,
      },
    });
    if (segment.visibility === "SHARED" || parsed.data.visibility === "SHARED") {
      await recordAudit({
        userId: user.id,
        action: "segment.shared.changed",
        entityType: "SavedSegment",
        entityId: input.id,
      });
    }
    revalidatePath("/segments");
    return { ok: true, message: "Segment updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function duplicateSegment(input: {
  id: string;
}): Promise<SegmentActionResult> {
  try {
    const user = await requireUser();
    const segment = await prisma.savedSegment.findUnique({ where: { id: input.id } });
    if (!segment || !canViewSegment(user, segment)) {
      return { ok: false, error: "Segment not found." };
    }
    const copy = await prisma.savedSegment.create({
      data: {
        name: `${segment.name} (copy)`.slice(0, 120),
        description: segment.description,
        visibility: "PRIVATE",
        filters: filtersToJson(validateSegmentFilters(segment.filters)),
        ownerId: user.id,
      },
    });
    revalidatePath("/segments");
    return { ok: true, message: "Segment duplicated.", segmentId: copy.id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSegment(input: {
  id: string;
}): Promise<SegmentActionResult> {
  try {
    const user = await requireUser();
    const segment = await prisma.savedSegment.findUnique({ where: { id: input.id } });
    if (!segment) return { ok: false, error: "Segment not found." };
    if (!canManageSegment(user, segment)) {
      return { ok: false, error: "You cannot delete this segment." };
    }
    await prisma.savedSegment.delete({ where: { id: input.id } });
    if (segment.visibility === "SHARED") {
      await recordAudit({
        userId: user.id,
        action: "segment.shared.deleted",
        entityType: "SavedSegment",
        entityId: input.id,
      });
    }
    revalidatePath("/segments");
    return { ok: true, message: "Segment deleted." };
  } catch (error) {
    return fail(error);
  }
}

export async function touchSegment(id: string): Promise<void> {
  try {
    const user = await requireUser();
    const segment = await prisma.savedSegment.findUnique({ where: { id } });
    if (!segment || !canViewSegment(user, segment)) return;
    await prisma.savedSegment.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  } catch {
    /* non-critical */
  }
}
