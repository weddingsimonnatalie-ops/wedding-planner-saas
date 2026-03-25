export const dynamic = "force-dynamic";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "@/components/settings/SettingsClient";

export default async function SettingsPage() {
  const session = await getSession();
  if (session?.user?.role !== "ADMIN") redirect("/");

  const [config, mealOptions, mealCounts, users] = await Promise.all([
    prisma.weddingConfig.findUnique({ where: { id: 1 } }),
    prisma.mealOption.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.guest.groupBy({
      by: ["mealChoice"],
      _count: { _all: true },
      where: { mealChoice: { not: null }, rsvpStatus: "ACCEPTED" },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        twoFactorEnabled: true,
        lockedUntil: true,
        emailVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const countMap = Object.fromEntries(
    mealCounts.map((r) => [r.mealChoice!, r._count._all])
  );

  // Check if email verification is required (SMTP is configured)
  const emailVerificationRequired = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  return (
    <>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>
      <SettingsClient
        config={config}
        mealOptions={mealOptions}
        mealCounts={countMap}
        users={users}
        currentUserEmail={session.user?.email ?? ""}
        emailVerificationRequired={emailVerificationRequired}
      />
    </>
  );
}