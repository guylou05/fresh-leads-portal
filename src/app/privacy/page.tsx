import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <PublicPage title="Privacy Policy">
      <p>
        This is a placeholder Privacy Policy for the FreshBiz Leads internal
        application. The finalized policy will be published before any external
        or production launch.
      </p>
      <p>
        FreshBiz Leads is an internal tool used by authorized staff to discover
        and enrich publicly available business records. Access is restricted to
        provisioned accounts and all sensitive actions are recorded in an audit
        log.
      </p>
    </PublicPage>
  );
}
