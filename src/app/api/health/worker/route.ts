import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { AuthzError } from "@/lib/authz";
import { getRedisConnection } from "@/lib/enrichment/queue";
import {
  AI_HEARTBEAT_KEY,
  isHeartbeatHealthy,
  readHeartbeat,
} from "@/lib/enrichment/worker-health";
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
  let aiHeartbeat = null;
  let redisOnline = false;
  try {
    const connection = getRedisConnection();
    redisOnline = (await connection.ping()) === "PONG";
    heartbeat = await readHeartbeat(connection);
    aiHeartbeat = await readHeartbeat(connection, AI_HEARTBEAT_KEY);
  } catch {
    redisOnline = false;
  }

  const [runningJobs, failedLeadJobs, aiRunningJobs, aiFailedLeadJobs, aiLastSuccess] =
    await Promise.all([
      prisma.enrichmentJob.count({ where: { status: "RUNNING" } }).catch(() => 0),
      prisma.enrichmentLeadJob.count({ where: { status: "FAILED" } }).catch(() => 0),
      prisma.aiJob.count({ where: { status: "RUNNING" } }).catch(() => 0),
      prisma.aiLeadJob.count({ where: { status: "FAILED" } }).catch(() => 0),
      prisma.aiJob
        .findFirst({ where: { status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } })
        .catch(() => null),
    ]);

  const online = isHeartbeatHealthy(heartbeat);
  const aiOnline = isHeartbeatHealthy(aiHeartbeat);
  return NextResponse.json({
    status: online || aiOnline ? "ok" : "offline",
    redis: redisOnline ? "connected" : "unavailable",
    worker: {
      online,
      version: heartbeat?.version ?? null,
      activeJobs: heartbeat?.activeJobs ?? 0,
      queueDepth: heartbeat?.queueDepth ?? 0,
      lastHeartbeatAt: heartbeat?.updatedAt ?? null,
    },
    aiWorker: {
      online: aiOnline,
      version: aiHeartbeat?.version ?? null,
      activeJobs: aiHeartbeat?.activeJobs ?? 0,
      queueDepth: aiHeartbeat?.queueDepth ?? 0,
      lastHeartbeatAt: aiHeartbeat?.updatedAt ?? null,
      lastSuccessfulJobAt: aiLastSuccess?.completedAt ?? null,
    },
    jobs: { enrichmentRunning: runningJobs, enrichmentFailedLeadJobs: failedLeadJobs, aiRunning: aiRunningJobs, aiFailedLeadJobs },
    timestamp: new Date().toISOString(),
  });
}
