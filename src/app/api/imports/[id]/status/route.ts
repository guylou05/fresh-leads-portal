import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch (error) {
    const status = error instanceof AuthzError ? 401 : 500;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  const { id } = await params;
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      totalRows: true,
      validRows: true,
      invalidRows: true,
      duplicateRows: true,
      importedRows: true,
      skippedRows: true,
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(batch);
}
