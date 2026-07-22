import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Imports" };

export default function ImportsPage() {
  return (
    <ComingSoon
      title="Imports"
      description="Upload Ohio Secretary of State TXT/CSV business reports and let FreshBiz Leads parse and de-duplicate the records."
      bullets={[
        "Upload TXT/CSV business registration reports",
        "Automatic parsing and column mapping",
        "De-duplication against existing leads",
        "Import history and status tracking",
      ]}
    />
  );
}
