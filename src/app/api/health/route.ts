import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe: confirms the application process is up. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "freshbiz-leads",
    timestamp: new Date().toISOString(),
  });
}
