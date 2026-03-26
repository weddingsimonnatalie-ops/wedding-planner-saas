export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { requireServerContext } from "@/lib/server-context";
import { ProfileClient } from "@/components/settings/ProfileClient";

export default async function ProfilePage() {
  const ctx = await requireServerContext();

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>
      <ProfileClient user={{ ...user, role: ctx.role }} />
    </div>
  );
}
