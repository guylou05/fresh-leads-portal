import { Queue } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { env } from "@/env";

export const ENRICHMENT_QUEUE = "enrichment";

export type EnrichmentJobData = {
  enrichmentJobId: string;
  enrichmentLeadJobId: string;
  businessRecordId: string;
};

let connection: Redis | null = null;
let queue: Queue<EnrichmentJobData> | null = null;

/** Shared ioredis connection (BullMQ requires maxRetriesPerRequest: null). */
export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    connection.on("error", (err) => {
      console.error("[redis] connection error", err.message);
    });
  }
  return connection;
}

/** Lazily-created BullMQ queue for enrichment lead jobs. */
export function getEnrichmentQueue(): Queue<EnrichmentJobData> {
  if (!queue) {
    queue = new Queue<EnrichmentJobData>(ENRICHMENT_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: env.ENRICHMENT_MAX_RETRIES + 1,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return queue;
}

/** Best-effort Redis PING for health reporting. */
export async function pingRedis(): Promise<boolean> {
  try {
    const res = await getRedisConnection().ping();
    return res === "PONG";
  } catch {
    return false;
  }
}
