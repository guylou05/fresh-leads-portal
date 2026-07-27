import { Worker, type Job } from "bullmq";
import { env } from "@/env";
import { getRedisConnection } from "@/lib/enrichment/queue";
import { AI_QUEUE, type AiJobData } from "@/lib/ai/queue";
import { processAiLeadJob } from "@/lib/ai/service";
import { writeHeartbeat } from "@/lib/enrichment/worker-health";

export const AI_WORKER_VERSION = "phase5-ai-1.0.0";
const AI_HEARTBEAT_KEY = "ai:worker:heartbeat";

const connection = getRedisConnection();
let activeJobs = 0;

const worker = new Worker<AiJobData>(
  AI_QUEUE,
  async (job: Job<AiJobData>) => {
    activeJobs += 1;
    try {
      await processAiLeadJob(job.data.aiLeadJobId);
    } finally {
      activeJobs = Math.max(0, activeJobs - 1);
    }
  },
  { connection, concurrency: env.AI_WORKER_CONCURRENCY },
);

worker.on("failed", (job, err) => {
  console.error(`[ai-worker] job ${job?.id ?? "?"} failed:`, err instanceof Error ? err.message : "unknown error");
});
worker.on("ready", () => {
  console.log(`[ai-worker] ready — version ${AI_WORKER_VERSION}, concurrency ${env.AI_WORKER_CONCURRENCY}`);
});

async function heartbeat(): Promise<void> {
  try {
    const queueDepth = await connection.llen(`bull:${AI_QUEUE}:wait`).catch(() => 0);
    await writeHeartbeat(connection, {
      version: AI_WORKER_VERSION,
      activeJobs,
      queueDepth: typeof queueDepth === "number" ? queueDepth : 0,
    }, AI_HEARTBEAT_KEY);
  } catch {
    /* non-fatal */
  }
}
const timer = setInterval(heartbeat, 15_000);
void heartbeat();

async function shutdown(signal: string): Promise<void> {
  console.log(`[ai-worker] received ${signal}, shutting down…`);
  clearInterval(timer);
  try {
    await worker.close();
  } catch (error) {
    console.error("[ai-worker] shutdown error", error);
  }
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.log("[ai-worker] AI worker started");
