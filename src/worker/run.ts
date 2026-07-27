import { Worker, type Job } from "bullmq";
import { env } from "@/env";
import {
  ENRICHMENT_QUEUE,
  getRedisConnection,
  type EnrichmentJobData,
} from "@/lib/enrichment/queue";
import { processLeadJob } from "@/lib/enrichment/service";
import {
  writeHeartbeat,
  WORKER_VERSION,
} from "@/lib/enrichment/worker-health";

const connection = getRedisConnection();
let activeJobs = 0;

const worker = new Worker<EnrichmentJobData>(
  ENRICHMENT_QUEUE,
  async (job: Job<EnrichmentJobData>) => {
    activeJobs += 1;
    try {
      await processLeadJob(job.data.enrichmentLeadJobId);
    } finally {
      activeJobs = Math.max(0, activeJobs - 1);
    }
  },
  {
    connection,
    concurrency: env.ENRICHMENT_WORKER_CONCURRENCY,
  },
);

worker.on("failed", (job, err) => {
  console.error(
    `[worker] job ${job?.id ?? "?"} failed:`,
    err instanceof Error ? err.message : "unknown error",
  );
});
worker.on("ready", () => {
  console.log(
    `[worker] ready — version ${WORKER_VERSION}, concurrency ${env.ENRICHMENT_WORKER_CONCURRENCY}`,
  );
});

// Heartbeat: publish liveness + basic stats every 15s (TTL 45s).
async function heartbeat(): Promise<void> {
  try {
    const queueDepth = await connection
      .llen(`bull:${ENRICHMENT_QUEUE}:wait`)
      .catch(() => 0);
    await writeHeartbeat(connection, {
      version: WORKER_VERSION,
      activeJobs,
      queueDepth: typeof queueDepth === "number" ? queueDepth : 0,
    });
  } catch {
    /* non-fatal */
  }
}
const heartbeatTimer = setInterval(heartbeat, 15_000);
void heartbeat();

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] received ${signal}, shutting down gracefully…`);
  clearInterval(heartbeatTimer);
  try {
    await worker.close();
    await connection.quit();
  } catch (error) {
    console.error("[worker] shutdown error", error);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.log("[worker] enrichment worker started");
