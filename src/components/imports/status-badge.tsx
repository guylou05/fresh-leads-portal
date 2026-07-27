import type { ImportStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

const STATUS_META: Record<ImportStatus, { label: string; tone: Tone }> = {
  UPLOADED: { label: "Uploaded", tone: "neutral" },
  VALIDATING: { label: "Validating", tone: "brand" },
  READY: { label: "Ready to import", tone: "brand" },
  IMPORTING: { label: "Importing", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  COMPLETED_WITH_ERRORS: { label: "Completed with errors", tone: "warning" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
