import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Enrichment" };

export default function EnrichmentPage() {
  return (
    <ComingSoon
      title="Enrichment"
      description="Enrich imported businesses with public contact data and quality signals."
      bullets={[
        "Public contact-data enrichment",
        "Website and email discovery",
        "Data-quality and confidence scoring",
        "Configurable enrichment pipelines",
      ]}
    />
  );
}
