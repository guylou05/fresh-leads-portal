import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Escape a value for CSV output. */
function csvCell(value: unknown): string {
  const str = value == null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    const status = error instanceof AuthzError ? 401 : 500;
    return new Response("Unauthorized", { status });
  }

  const { id } = await params;
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    select: { id: true, originalFileName: true },
  });
  if (!batch) return new Response("Not found", { status: 404 });

  const errors = await prisma.importRowError.findMany({
    where: { importBatchId: id },
    orderBy: { rowNumber: "asc" },
  });

  const header = ["Row Number", "Error Code", "Error Message", "Raw Data"];
  const lines = [header.map(csvCell).join(",")];
  for (const err of errors) {
    lines.push(
      [
        csvCell(err.rowNumber),
        csvCell(err.errorCode),
        csvCell(err.errorMessage),
        csvCell(err.rawData ? JSON.stringify(err.rawData) : ""),
      ].join(","),
    );
  }
  const body = `\uFEFF${lines.join("\r\n")}\r\n`;

  await recordAudit({
    userId: user.id,
    action: "import.errors.downloaded",
    entityType: "ImportBatch",
    entityId: id,
    metadata: { errorCount: errors.length },
  });

  const safeName = batch.originalFileName.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invalid-rows-${safeName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
