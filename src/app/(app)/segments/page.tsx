import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Segments" };

export default function SegmentsPage() {
  return (
    <ComingSoon
      title="Segments"
      description="Group and prioritize leads using AI-assisted segmentation and scoring."
      bullets={[
        "AI-assisted lead segmentation",
        "Custom segment rules and filters",
        "Priority scoring",
        "Saved segments for exports",
      ]}
    />
  );
}
