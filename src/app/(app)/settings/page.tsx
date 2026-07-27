import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "@/components/settings/profile-form";
import { PasswordForm } from "@/components/settings/password-form";
import { signOutAction } from "@/app/(app)/actions";
import { isAdmin } from "@/lib/authz";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdmin(user);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your profile, password, and preferences."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" description="Update your account details." />
          <CardBody>
            <ProfileForm
              name={user?.name ?? ""}
              email={user?.email ?? ""}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Change password"
            description="Choose a strong password you don't use elsewhere."
          />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Application preferences"
            description="Personalization options are coming in a future phase."
            action={<Badge tone="warning">Coming soon</Badge>}
          />
          <CardBody>
            <ul className="space-y-3 text-sm text-slate-500">
              <li className="flex items-center justify-between">
                <span>Email notifications</span>
                <Badge tone="neutral">Planned</Badge>
              </li>
              <li className="flex items-center justify-between">
                <span>Default lead view</span>
                <Badge tone="neutral">Planned</Badge>
              </li>
              <li className="flex items-center justify-between">
                <span>Theme</span>
                <Badge tone="neutral">Planned</Badge>
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Account" />
          <CardBody className="space-y-4">
            {admin && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Administration
                  </h3>
                  <Badge tone="brand">Admin</Badge>
                </div>
                <p className="mb-3 text-sm text-slate-500">
                  Manage team members, roles, and access.
                </p>
                <div className="flex flex-col gap-1">
                  <Link
                    href="/settings/users"
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Manage users →
                  </Link>
                  <Link
                    href="/settings/tags"
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Manage tags →
                  </Link>
                  <Link
                    href="/settings/enrichment"
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Enrichment settings →
                  </Link>
                  <Link
                    href="/settings/ai"
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    AI settings →
                  </Link>
                </div>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Tags</h3>
              <p className="mb-3 text-sm text-slate-500">
                View the tag catalog used to organize leads.
              </p>
              <Link
                href="/settings/tags"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View tags →
              </Link>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Sign out</h3>
              <p className="mb-3 text-sm text-slate-500">
                Sign out of FreshBiz Leads on this device.
              </p>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </form>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
