export const dynamic = "force-dynamic";

import { requireServerContext } from "@/lib/server-context";
import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant";
import { SettingsClient } from "@/components/settings/SettingsClient";

export default async function SettingsPage() {
  const ctx = await requireServerContext(["ADMIN"]);
  const { weddingId } = ctx;

  const [config, mealOptions, mealCounts, members] = await withTenantContext(
    weddingId,
    async (tx) =>
      Promise.all([
        tx.wedding.findUnique({ where: { id: weddingId } }),
        tx.mealOption.findMany({
          where: { weddingId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
        tx.guest.groupBy({
          by: ["mealChoice"],
          _count: { _all: true },
          where: { weddingId, mealChoice: { not: null }, rsvpStatus: "ACCEPTED" },
        }),
        // WeddingMember query — global table, but we need it here for user management
        // Use prisma directly (not tx) since WeddingMember has no RLS
        prisma.weddingMember.findMany({
          where: { weddingId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                twoFactorEnabled: true,
                lockedUntil: true,
                emailVerified: true,
                createdAt: true,
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        }),
      ])
  );

  const countMap = Object.fromEntries(
    mealCounts.map((r) => [r.mealChoice!, r._count._all])
  );

  // Flatten members into the user shape the SettingsClient expects, adding role from WeddingMember
  const users = members.map((m) => ({
    ...m.user,
    role: m.role,
  }));

  const emailVerificationRequired = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );

  const billing = config
    ? {
        subscriptionStatus: config.subscriptionStatus,
        currentPeriodEnd: config.currentPeriodEnd,
        trialEndsAt: config.trialEndsAt,
        gracePeriodEndsAt: config.gracePeriodEndsAt,
      }
    : null;

  return (
    <>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>
      <SettingsClient
        config={config}
        mealOptions={mealOptions}
        mealCounts={countMap}
        users={users}
        currentUserEmail={ctx.userEmail}
        emailVerificationRequired={emailVerificationRequired}
        billing={billing}
      />
    </>
  );
}
