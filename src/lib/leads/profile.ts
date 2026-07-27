import type {
  LeadPriority,
  LeadProfile,
  LeadStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { recordActivity } from "@/lib/leads/activity";

type Client = PrismaClient | Prisma.TransactionClient;

/** The effective sales state of a business record that has no LeadProfile. */
export type EffectiveLeadState = {
  status: LeadStatus;
  priority: LeadPriority;
  assignedToId: string | null;
  hasProfile: boolean;
};

export const DEFAULT_LEAD_STATE: EffectiveLeadState = {
  status: "NEW",
  priority: "NORMAL",
  assignedToId: null,
  hasProfile: false,
};

/** Resolve the effective lead state whether or not a profile exists. */
export function effectiveLeadState(
  profile: Pick<LeadProfile, "status" | "priority" | "assignedToId"> | null,
): EffectiveLeadState {
  if (!profile) return DEFAULT_LEAD_STATE;
  return {
    status: profile.status,
    priority: profile.priority,
    assignedToId: profile.assignedToId,
    hasProfile: true,
  };
}

/**
 * Get an existing LeadProfile for a business record, or create it lazily.
 * Creating records a PROFILE_CREATED activity. Must run inside a transaction
 * when combined with other writes.
 */
export async function getOrCreateProfile(
  client: Client,
  businessRecordId: string,
  userId: string,
): Promise<LeadProfile> {
  const existing = await client.leadProfile.findUnique({
    where: { businessRecordId },
  });
  if (existing) return existing;

  const created = await client.leadProfile.create({
    data: {
      businessRecordId,
      status: "NEW",
      priority: "NORMAL",
      createdById: userId,
      updatedById: userId,
    },
  });

  await recordActivity(client, {
    leadProfileId: created.id,
    actorId: userId,
    activityType: "PROFILE_CREATED",
    title: "Lead profile created",
  });

  return created;
}
