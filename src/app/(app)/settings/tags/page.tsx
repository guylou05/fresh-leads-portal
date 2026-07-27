import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { TagsManager, type TagRow } from "@/components/settings/tags-manager";

export const metadata: Metadata = { title: "Tags" };

export default async function TagsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const admin = isAdmin(session.user);

  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { leadTags: true } } },
  });

  const rows: TagRow[] = tags.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    color: t.color,
    usageCount: t._count.leadTags,
  }));

  return (
    <div>
      <PageHeader
        title="Tags"
        description={
          admin
            ? "Create and manage the tag catalog used across leads."
            : "Tags available to apply to leads. Only administrators can manage the catalog."
        }
        action={
          <Link
            href="/settings"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            ← Settings
          </Link>
        }
      />
      <Card>
        <CardBody>
          <TagsManager tags={rows} isAdmin={admin} />
        </CardBody>
      </Card>
    </div>
  );
}
