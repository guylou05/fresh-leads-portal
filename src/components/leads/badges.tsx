import type { LeadPriority, LeadStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  LEAD_PRIORITY_LABELS,
  LEAD_STATUS_LABELS,
  tagColorClasses,
} from "@/lib/leads/constants";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

const STATUS_TONE: Record<LeadStatus, Tone> = {
  NEW: "brand",
  REVIEWING: "brand",
  QUALIFIED: "success",
  CONTACT_READY: "success",
  CONTACTED: "neutral",
  FOLLOW_UP: "warning",
  INTERESTED: "success",
  PROPOSAL: "warning",
  WON: "success",
  LOST: "danger",
  DISQUALIFIED: "danger",
  ARCHIVED: "neutral",
};

const PRIORITY_TONE: Record<LeadPriority, Tone> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "danger",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{LEAD_STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: LeadPriority }) {
  if (priority === "NORMAL") {
    return <span className="text-xs text-slate-400">Normal</span>;
  }
  return (
    <Badge tone={PRIORITY_TONE[priority]}>{LEAD_PRIORITY_LABELS[priority]}</Badge>
  );
}

export function TagChip({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tagColorClasses(color),
      )}
    >
      {name}
    </span>
  );
}
