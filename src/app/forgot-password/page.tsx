import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";

export const metadata: Metadata = {
  title: "Forgot password",
};

export default function ForgotPasswordPage() {
  return (
    <PublicPage title="Forgot your password?">
      <p>
        FreshBiz Leads is an internal application and does not currently support
        self-service password resets.
      </p>
      <p>
        Please contact your workspace administrator, who can reset your password
        from the admin user-management screen.
      </p>
    </PublicPage>
  );
}
