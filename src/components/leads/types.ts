import type { LeadPriority, LeadStatus } from "@prisma/client";

export type LeadRow = {
  businessRecordId: string;
  businessName: string;
  effectiveDate: string | null;
  businessCity: string | null;
  county: string | null;
  entityType: string | null;
  charterNumber: string | null;
  source: string;
  status: LeadStatus;
  priority: LeadPriority;
  assignedToName: string | null;
  tags: { id: string; name: string; color: string | null }[];
  primaryContactName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  website: string | null;
  followUpAt: string | null;
  updatedAt: string | null;
  hasProfile: boolean;
};

export type UserOption = { id: string; name: string };
export type TagOption = { id: string; name: string; color: string | null };
