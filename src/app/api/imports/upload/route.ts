import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { DEFAULT_SOURCE } from "@/lib/imports/config";
import {
  fileExtension,
  generateStoredFileName,
  sanitizeFileName,
  sha256,
  writeTempFile,
  deleteTempFile,
} from "@/lib/imports/storage";
import { looksBinary, validateFileMeta } from "@/lib/imports/validation";
import { analyzeFile } from "@/lib/imports/service";
import { Readable } from "node:stream";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let storedFileName: string | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const source =
      (formData.get("source") as string | null)?.trim() || DEFAULT_SOURCE;

    if (!(file instanceof File)) {
      return badRequest("No file was provided.");
    }

    const originalFileName = sanitizeFileName(file.name);
    const meta = validateFileMeta({
      fileName: originalFileName,
      size: file.size,
      mimeType: file.type,
    });
    if (!meta.ok) return badRequest(meta.error);

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) return badRequest("The file is empty.");
    if (looksBinary(buffer)) {
      return badRequest("The file appears to be binary, not a text report.");
    }

    const checksum = sha256(buffer);
    const extension = fileExtension(originalFileName);
    storedFileName = generateStoredFileName(extension);
    await writeTempFile(storedFileName, buffer);

    const analysis = await analyzeFile({
      createStream: () => Readable.from(buffer),
      source,
      fileName: originalFileName,
    });
    if (!analysis.ok) {
      await deleteTempFile(storedFileName);
      return badRequest(analysis.error);
    }

    const metadata = {
      mapping: analysis.mapping,
      unknownHeaders: analysis.unknownHeaders,
      reportType: {
        value: analysis.reportType,
        confidence: analysis.reportTypeConfidence,
      },
      preview: analysis.previewRows,
      estimatedCounts: analysis.counts,
    } satisfies Record<string, unknown>;

    const batch = await prisma.importBatch.create({
      data: {
        originalFileName,
        storedFileName,
        fileType: extension.replace(".", "").toUpperCase(),
        fileSizeBytes: buffer.length,
        checksum,
        source,
        reportType: analysis.reportType,
        status: "READY",
        totalRows: analysis.counts.totalRows,
        validRows: analysis.counts.validRows,
        invalidRows: analysis.counts.invalidRows,
        duplicateRows:
          analysis.counts.exactDuplicates + analysis.counts.possibleDuplicates,
        uploadedById: user.id,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    await recordAudit({
      userId: user.id,
      action: "import.file.uploaded",
      entityType: "ImportBatch",
      entityId: batch.id,
      metadata: {
        originalFileName,
        fileSizeBytes: buffer.length,
        checksum,
      },
    });
    await recordAudit({
      userId: user.id,
      action: "import.preview.generated",
      entityType: "ImportBatch",
      entityId: batch.id,
      metadata: { totalRows: analysis.counts.totalRows },
    });

    return NextResponse.json({ batchId: batch.id });
  } catch (error) {
    await deleteTempFile(storedFileName);
    console.error(
      "[import.upload] failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { error: "Could not process the uploaded file. Please try again." },
      { status: 500 },
    );
  }
}
