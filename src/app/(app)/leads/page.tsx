import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <ComingSoon
      title="Leads"
      description="Browse, filter, and manage the business leads imported from your reports."
      bullets={[
        "Searchable, filterable lead table",
        "Lead detail views with enrichment data",
        "Status and ownership management",
        "Bulk actions and tagging",
      ]}
    />
  );
}
