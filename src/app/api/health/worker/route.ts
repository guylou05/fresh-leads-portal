import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { getRedisConnection } from "@/lib/enrichment/queue";
import { isHeartbeatHealthy, readHeartbeat } from "@/lib/enrichment/worker-health";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Worker health. Reports heartbeat + queue/job stats without exposing Redis
 * credentials or job payloads. Authenticated (internal) access only.
 */
export async function GET() {
  try {
    await requireUser();
  } catch (error) {
    const status = error instanceof AuthzError ? 401 : 500;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  let heartbeat = null;
  let redisOnline = false;
  try {
    const connection = getRedisConnection();
    redisOnline = (await connection.ping()) === "PONG";
    heartbeat = await readHeartbeat(connection);
  } catch {
    redisOnline = false;
  }

  const [runningJobs, failedLeadJobs] = await Promise.all([
    prisma.enrichmentJob.count({ where: { status: "RUNNING" } }).catch(() => 0),
    prisma.enrichmentLeadJob.count({ where: { status: "FAILED" } }).catch(() => 0),
  ]);

  const online = isHeartbeatHealthy(heartbeat);
  return NextResponse.json({
    status: online ? "ok" : "offline",
    redis: redisOnline ? "connected" : "unavailable",
    worker: {
      online,
      version: heartbeat?.version ?? null,
      activeJobs: heartbeat?.activeJobs ?? 0,
      queueDepth: heartbeat?.queueDepth ?? 0,
      lastHeartbeatAt: heartbeat?.updatedAt ?? null,
    },
    jobs: { running: runningJobs, failedLeadJobs },
    timestamp: new Date().toISOString(),
  });
}
