"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { canManageTags } from "@/lib/leads/permissions";
import { normalizeTagName, tagInputSchema } from "@/lib/tags";

export type TagActionResult = { ok: boolean; error?: string; message?: string };

async function requireTagAdmin() {
  const user = await requireUser();
  if (!canManageTags(user)) {
    throw new AuthzError("Only administrators can manage tags.");
  }
  return user;
}

function fail(error: unknown): TagActionResult {
  if (error instanceof AuthzError) return { ok: false, error: error.message };
  console.error(
    "[tags.action] failed",
    error instanceof Error ? error.message : "unknown error",
  );
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createTag(input: {
  name: string;
  description?: string;
  color?: string;
}): Promise<TagActionResult> {
  try {
    const user = await requireTagAdmin();
    const parsed = tagInputSchema.safeParse({
      name: input.name,
      description: input.description,
      color: input.color ?? "slate",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const normalizedName = normalizeTagName(parsed.data.name);
    const tag = await prisma.tag.create({
      data: {
        name: parsed.data.name,
        normalizedName,
        description: parsed.data.description ?? null,
        color: parsed.data.color,
        createdById: user.id,
      },
    });
    await recordAudit({
      userId: user.id,
      action: "tag.created",
      entityType: "Tag",
      entityId: tag.id,
      metadata: { name: tag.name },
    });
    revalidatePath("/settings/tags");
    return { ok: true, message: `Tag "${tag.name}" created.` };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "A tag with that name already exists." };
    }
    return fail(error);
  }
}

export async function updateTag(input: {
  id: string;
  name: string;
  description?: string;
  color?: string;
}): Promise<TagActionResult> {
  try {
    const user = await requireTagAdmin();
    const parsed = tagInputSchema.safeParse({
      name: input.name,
      description: input.description,
      color: input.color ?? "slate",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const before = await prisma.tag.findUnique({ where: { id: input.id } });
    if (!before) return { ok: false, error: "Tag not found." };

    await prisma.tag.update({
      where: { id: input.id },
      data: {
        name: parsed.data.name,
        normalizedName: normalizeTagName(parsed.data.name),
        description: parsed.data.description ?? null,
        color: parsed.data.color,
      },
    });
    await recordAudit({
      userId: user.id,
      action: "tag.renamed",
      entityType: "Tag",
      entityId: input.id,
      metadata: { from: before.name, to: parsed.data.name },
    });
    revalidatePath("/settings/tags");
    revalidatePath("/leads");
    return { ok: true, message: "Tag updated." };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "A tag with that name already exists." };
    }
    return fail(error);
  }
}

export async function deleteTag(input: {
  id: string;
  force?: boolean;
}): Promise<TagActionResult> {
  try {
    const user = await requireTagAdmin();
    const usage = await prisma.leadTag.count({ where: { tagId: input.id } });
    if (usage > 0 && !input.force) {
      return {
        ok: false,
        error: `This tag is applied to ${usage} lead(s). Confirm removal from all leads, or merge it into another tag first.`,
      };
    }
    await prisma.$transaction(async (tx) => {
      if (usage > 0) await tx.leadTag.deleteMany({ where: { tagId: input.id } });
      await tx.tag.delete({ where: { id: input.id } });
    });
    await recordAudit({
      userId: user.id,
      action: "tag.deleted",
      entityType: "Tag",
      entityId: input.id,
      metadata: { removedFromLeads: usage },
    });
    revalidatePath("/settings/tags");
    revalidatePath("/leads");
    return { ok: true, message: "Tag deleted." };
  } catch (error) {
    return fail(error);
  }
}

export async function mergeTags(input: {
  sourceId: string;
  targetId: string;
}): Promise<TagActionResult> {
  try {
    const user = await requireTagAdmin();
    if (input.sourceId === input.targetId) {
      return { ok: false, error: "Choose two different tags to merge." };
    }
    const [source, target] = await Promise.all([
      prisma.tag.findUnique({ where: { id: input.sourceId } }),
      prisma.tag.findUnique({ where: { id: input.targetId } }),
    ]);
    if (!source || !target) return { ok: false, error: "Tag not found." };

    await prisma.$transaction(async (tx) => {
      const sourceLinks = await tx.leadTag.findMany({
        where: { tagId: input.sourceId },
      });
      for (const link of sourceLinks) {
        const exists = await tx.leadTag.findUnique({
          where: {
            leadProfileId_tagId: {
              leadProfileId: link.leadProfileId,
              tagId: input.targetId,
            },
          },
        });
        if (exists) {
          await tx.leadTag.delete({ where: { id: link.id } });
        } else {
          await tx.leadTag.update({
            where: { id: link.id },
            data: { tagId: input.targetId },
          });
        }
      }
      await tx.tag.delete({ where: { id: input.sourceId } });
    });
    await recordAudit({
      userId: user.id,
      action: "tag.merged",
      entityType: "Tag",
      entityId: input.targetId,
      metadata: { from: source.name, into: target.name },
    });
    revalidatePath("/settings/tags");
    revalidatePath("/leads");
    return { ok: true, message: `Merged "${source.name}" into "${target.name}".` };
  } catch (error) {
    return fail(error);
  }
}
