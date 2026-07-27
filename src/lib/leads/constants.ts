import type { LeadPriority, LeadStatus } from "@prisma/client";

/** Human labels for each lead status. */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  QUALIFIED: "Qualified",
  CONTACT_READY: "Contact ready",
  CONTACTED: "Contacted",
  FOLLOW_UP: "Follow-up",
  INTERESTED: "Interested",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
  DISQUALIFIED: "Disqualified",
  ARCHIVED: "Archived",
};

export const LEAD_STATUS_VALUES = Object.keys(
  LEAD_STATUS_LABELS,
) as LeadStatus[];

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const LEAD_PRIORITY_VALUES = Object.keys(
  LEAD_PRIORITY_LABELS,
) as LeadPriority[];

/** Statuses considered "active" (in the working pipeline). */
export const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "REVIEWING",
  "QUALIFIED",
  "CONTACT_READY",
  "CONTACTED",
  "FOLLOW_UP",
  "INTERESTED",
  "PROPOSAL",
];

/** Statuses whose entry should prompt to clear an existing follow-up. */
export const FOLLOWUP_CLEAR_PROMPT_STATUSES: LeadStatus[] = [
  "WON",
  "LOST",
  "DISQUALIFIED",
  "ARCHIVED",
];

/** Suggested disqualification reasons. */
export const DISQUALIFICATION_REASONS = [
  "Duplicate business",
  "Outside service area",
  "Residential or non-commercial",
  "Unable to verify",
  "Not a suitable industry",
  "Already closed",
  "Existing customer",
  "No contact path",
  "Other",
] as const;

/**
 * Approved tag color palette. Tags store only a palette NAME (never arbitrary
 * CSS), which maps to fixed badge classes at render time.
 */
export const TAG_PALETTE = {
  slate: "bg-slate-100 text-slate-700",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-800",
  teal: "bg-teal-100 text-teal-800",
  blue: "bg-blue-100 text-blue-800",
  violet: "bg-violet-100 text-violet-800",
  pink: "bg-pink-100 text-pink-800",
} as const;

export type TagColor = keyof typeof TAG_PALETTE;

export const TAG_COLOR_VALUES = Object.keys(TAG_PALETTE) as TagColor[];
export const DEFAULT_TAG_COLOR: TagColor = "slate";

export function tagColorClasses(color: string | null | undefined): string {
  if (color && color in TAG_PALETTE) {
    return TAG_PALETTE[color as TagColor];
  }
  return TAG_PALETTE[DEFAULT_TAG_COLOR];
}

/** Selectable page sizes for the leads table. */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export const NOTE_MAX_LENGTH = 5000;
export const SUMMARY_MAX_LENGTH = 5000;
export const MAX_BULK_SELECTION = 500;
