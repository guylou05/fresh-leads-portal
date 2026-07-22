import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <PublicPage title="Terms of Service">
      <p>
        This is a placeholder Terms of Service for the FreshBiz Leads internal
        application. Formal terms will be added before any external or production
        launch.
      </p>
      <p>
        By accessing this internal tool you agree to use it only for authorized
        business purposes and in accordance with your organization&apos;s
        acceptable-use policies.
      </p>
    </PublicPage>
  );
}
