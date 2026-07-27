import { Queue } from "bullmq";
import { env } from "@/env";
import { getRedisConnection } from "@/lib/enrichment/queue";

export const AI_QUEUE = "ai-analysis";

export type AiJobData = {
  aiJobId: string;
  aiLeadJobId: string;
  businessRecordId: string;
};

let queue: Queue<AiJobData> | null = null;

/** Lazily-created BullMQ queue for AI lead jobs (reuses the shared Redis). */
export function getAiQueue(): Queue<AiJobData> {
  if (!queue) {
    queue = new Queue<AiJobData>(AI_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: env.AI_MAX_RETRIES + 1,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return queue;
}
