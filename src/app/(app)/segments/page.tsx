import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import {
  SegmentsManager,
  type SegmentItem,
} from "@/components/segments/segments-manager";
import { canManageSegment } from "@/lib/leads/permissions";
import { filtersToParams, sanitizeFilters } from "@/lib/leads/query";

export const metadata: Metadata = { title: "Segments" };

export default async function SegmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const admin = isAdmin(session.user);
  const userId = session.user.id;

  const segments = await prisma.savedSegment.findMany({
    where: { OR: [{ ownerId: userId }, { visibility: "SHARED" }] },
    orderBy: [{ visibility: "asc" }, { updatedAt: "desc" }],
    include: { owner: { select: { name: true } } },
  });

  const items: SegmentItem[] = segments.map((s) => {
    const filters = sanitizeFilters(s.filters);
    const params = new URLSearchParams(filtersToParams(filters));
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      visibility: s.visibility,
      ownerName: s.ownerId === userId ? "You" : s.owner.name,
      isOwner: s.ownerId === userId,
      canManage: canManageSegment(session.user, s),
      href: `/leads?${params.toString()}`,
      filterCount: Object.keys(filters).length,
    };
  });

  return (
    <div>
      <PageHeader
        title="Segments"
        description="Saved lead filters you can re-apply. Create new segments from the Leads page."
      />
      <Card>
        <CardBody>
          <SegmentsManager segments={items} isAdmin={admin} />
        </CardBody>
      </Card>
    </div>
  );
}
