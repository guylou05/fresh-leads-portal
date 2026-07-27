import type { Redis } from "ioredis";

export const WORKER_VERSION = "phase4-1.0.0";
export const HEARTBEAT_KEY = "enrichment:worker:heartbeat";
const HEARTBEAT_TTL_SECONDS = 45;

export type WorkerHeartbeat = {
  version: string;
  activeJobs: number;
  queueDepth: number;
  updatedAt: string;
};

export async function writeHeartbeat(
  connection: Redis,
  data: Omit<WorkerHeartbeat, "updatedAt">,
): Promise<void> {
  const payload: WorkerHeartbeat = { ...data, updatedAt: new Date().toISOString() };
  await connection.set(
    HEARTBEAT_KEY,
    JSON.stringify(payload),
    "EX",
    HEARTBEAT_TTL_SECONDS,
  );
}

export async function readHeartbeat(
  connection: Redis,
): Promise<WorkerHeartbeat | null> {
  try {
    const raw = await connection.get(HEARTBEAT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkerHeartbeat;
  } catch {
    return null;
  }
}

/** A heartbeat within ~2 intervals is considered healthy/online. */
export function isHeartbeatHealthy(
  heartbeat: WorkerHeartbeat | null,
  now: number = Date.now(),
): boolean {
  if (!heartbeat) return false;
  const age = now - new Date(heartbeat.updatedAt).getTime();
  return age < HEARTBEAT_TTL_SECONDS * 1000;
}
