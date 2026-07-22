import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Exports" };

export default function ExportsPage() {
  return (
    <ComingSoon
      title="Exports"
      description="Export CRM-ready contact lists from your enriched and segmented leads."
      bullets={[
        "CRM-ready CSV exports",
        "Export from saved segments",
        "Field mapping and templates",
        "Export history and re-download",
      ]}
    />
  );
}
