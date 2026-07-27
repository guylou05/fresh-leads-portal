import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LEAD_STATE,
  effectiveLeadState,
  getOrCreateProfile,
} from "@/lib/leads/profile";

type Client = Parameters<typeof getOrCreateProfile>[0];

describe("effective lead state", () => {
  it("defaults to NEW / NORMAL / unassigned when no profile exists", () => {
    expect(effectiveLeadState(null)).toEqual(DEFAULT_LEAD_STATE);
    expect(effectiveLeadState(null).hasProfile).toBe(false);
  });

  it("reflects an existing profile", () => {
    const state = effectiveLeadState({
      status: "QUALIFIED",
      priority: "HIGH",
      assignedToId: "u1",
    });
    expect(state).toEqual({
      status: "QUALIFIED",
      priority: "HIGH",
      assignedToId: "u1",
      hasProfile: true,
    });
  });
});

describe("lazy profile creation", () => {
  it("returns the existing profile without creating a new one", async () => {
    const existing = { id: "p1", businessRecordId: "b1", status: "REVIEWING" };
    const create = vi.fn();
    const activity = vi.fn();
    const client = {
      leadProfile: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create,
      },
      leadActivity: { create: activity },
    } as unknown as Client;

    const result = await getOrCreateProfile(client, "b1", "u1");
    expect(result).toBe(existing);
    expect(create).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
  });

  it("creates a profile and records a PROFILE_CREATED activity when missing", async () => {
    const created = { id: "p2", businessRecordId: "b2", status: "NEW" };
    const activity = vi.fn().mockResolvedValue(undefined);
    const client = {
      leadProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      leadActivity: { create: activity },
    } as unknown as Client;

    const result = await getOrCreateProfile(client, "b2", "u1");
    expect(result).toBe(created);
    expect(activity).toHaveBeenCalledTimes(1);
    const arg = activity.mock.calls[0]?.[0] as { data: { activityType: string } };
    expect(arg.data.activityType).toBe("PROFILE_CREATED");
  });
});
