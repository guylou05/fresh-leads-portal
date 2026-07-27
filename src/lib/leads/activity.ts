import type { Prisma, PrismaClient, LeadActivityType } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export type ActivityInput = {
  leadProfileId: string;
  actorId?: string | null;
  activityType: LeadActivityType;
  title: string;
  description?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

/** Record a user-facing lead activity entry. */
export async function recordActivity(
  client: Client,
  input: ActivityInput,
): Promise<void> {
  await client.leadActivity.create({
    data: {
      leadProfileId: input.leadProfileId,
      actorId: input.actorId ?? null,
      activityType: input.activityType,
      title: input.title,
      description: input.description ?? null,
      metadata:
        input.metadata === null || input.metadata === undefined
          ? undefined
          : input.metadata,
    },
  });
}

/** Human phrase describing a value transition, for activity titles. */
export function transitionTitle(
  label: string,
  from: string | null,
  to: string,
): string {
  return from ? `${label} changed from ${from} to ${to}` : `${label} set to ${to}`;
}
