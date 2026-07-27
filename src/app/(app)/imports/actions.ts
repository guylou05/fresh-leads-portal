"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ImportBatch } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { assertCanDeleteImportBatch } from "@/lib/imports/permissions";
import { executeImport } from "@/lib/imports/service";
import { deleteTempFile } from "@/lib/imports/storage";

export type ImportActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

function fail(error: unknown): ImportActionState {
  if (error instanceof AuthzError) return { error: error.message };
  console.error(
    "[imports.action] failed",
    error instanceof Error ? error.message : "unknown error",
  );
  return { error: "Something went wrong. Please try again." };
}

/**
 * Background import runner. Runs after the action responds; on a persistent
 * (Railway) Node server the promise continues on the event loop. Status +
 * progress are observed via polling.
 */
async function runImport(
  batch: ImportBatch,
  options: { includePossible: boolean; importedById: string },
): Promise<void> {
  try {
    const summary = await executeImport(batch, options);
    await recordAudit({
      userId: options.importedById,
      action: "import.completed",
      entityType: "ImportBatch",
      entityId: batch.id,
      metadata: {
        importedRows: summary.importedRows,
        invalidRows: summary.invalidRows,
        duplicateRows: summary.duplicateRows,
      },
    });
  } catch (error) {
    await prisma.importBatch
      .update({
        where: { id: batch.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "Import failed.",
        },
      })
      .catch(() => {});
    await recordAudit({
      userId: options.importedById,
      action: "import.failed",
      entityType: "ImportBatch",
      entityId: batch.id,
    });
  } finally {
    await deleteTempFile(batch.storedFileName);
  }
}

const startSchema = z.object({
  batchId: z.string().min(1),
  includePossible: z.boolean(),
  reportType: z.string().trim().min(1).max(120).optional(),
});

export async function startImport(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    const user = await requireUser();
    const parsed = startSchema.safeParse({
      batchId: formData.get("batchId"),
      includePossible: formData.get("includePossible") === "on",
      reportType: formData.get("reportType") || undefined,
    });
    if (!parsed.success) return { error: "Invalid request." };

    // Atomically claim a READY batch so it can't be started twice.
    const claimed = await prisma.importBatch.updateMany({
      where: { id: parsed.data.batchId, status: "READY" },
      data: {
        status: "IMPORTING",
        startedAt: new Date(),
        ...(parsed.data.reportType ? { reportType: parsed.data.reportType } : {}),
      },
    });
    if (claimed.count !== 1) {
      return { error: "This import is not ready to start." };
    }

    const batch = await prisma.importBatch.findUnique({
      where: { id: parsed.data.batchId },
    });
    if (!batch) return { error: "Import not found." };

    await recordAudit({
      userId: user.id,
      action: "import.started",
      entityType: "ImportBatch",
      entityId: batch.id,
      metadata: { includePossible: parsed.data.includePossible },
    });

    // Fire-and-forget: the details page polls for progress.
    void runImport(batch, {
      includePossible: parsed.data.includePossible,
      importedById: user.id,
    });

    revalidatePath(`/imports/${batch.id}`);
    revalidatePath("/imports");
    return { ok: true, message: "Import started." };
  } catch (error) {
    return fail(error);
  }
}

const idSchema = z.object({ batchId: z.string().min(1) });

export async function cancelImport(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    const user = await requireUser();
    const parsed = idSchema.safeParse({ batchId: formData.get("batchId") });
    if (!parsed.success) return { error: "Invalid request." };

    const batch = await prisma.importBatch.findUnique({
      where: { id: parsed.data.batchId },
    });
    if (!batch) return { error: "Import not found." };
    if (batch.status !== "READY" && batch.status !== "UPLOADED") {
      return { error: "This import can no longer be cancelled." };
    }

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "CANCELLED" },
    });
    await deleteTempFile(batch.storedFileName);

    await recordAudit({
      userId: user.id,
      action: "import.cancelled",
      entityType: "ImportBatch",
      entityId: batch.id,
    });

    revalidatePath(`/imports/${batch.id}`);
    revalidatePath("/imports");
    return { ok: true, message: "Import cancelled." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteImportBatch(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    const user = await requireUser();
    const parsed = idSchema.safeParse({ batchId: formData.get("batchId") });
    if (!parsed.success) return { error: "Invalid request." };

    const batch = await prisma.importBatch.findUnique({
      where: { id: parsed.data.batchId },
      select: { id: true, status: true, importedRows: true, storedFileName: true },
    });
    if (!batch) return { error: "Import not found." };

    assertCanDeleteImportBatch(user, batch);

    await deleteTempFile(batch.storedFileName);
    await prisma.importBatch.delete({ where: { id: batch.id } });

    await recordAudit({
      userId: user.id,
      action: "import.batch.deleted",
      entityType: "ImportBatch",
      entityId: batch.id,
    });

    revalidatePath("/imports");
    return { ok: true, message: "Import deleted." };
  } catch (error) {
    return fail(error);
  }
}
