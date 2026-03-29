export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerContext } from "@/lib/server-context";
import { LayoutShell } from "@/components/LayoutShell";
import { InactivityTimer } from "@/components/auth/InactivityTimer";
import { RefreshProvider } from "@/context/RefreshContext";
import { FormDirtyProvider } from "@/context/FormDirtyContext";
import { WeddingProvider } from "@/context/WeddingContext";
import { GracePeriodBanner } from "@/components/billing/GracePeriodBanner";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getServerContext();
  if (!ctx) redirect("/login");

  const [failedLoginCount, weddingBilling] = await Promise.all([
    ctx.userEmail
      ? prisma.loginAttempt.count({
          where: {
            email: ctx.userEmail,
            success: false,
            createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        })
      : Promise.resolve(0),
    prisma.wedding.findUnique({
      where: { id: ctx.weddingId },
      select: { subscriptionStatus: true, gracePeriodEndsAt: true },
    }),
  ]);

  // Subscription gate — redirect lapsed users to billing/suspended
  // (runs in Node.js runtime, so Prisma works here unlike in middleware)
  if (weddingBilling) {
    const { subscriptionStatus, gracePeriodEndsAt } = weddingBilling;
    const lapsed =
      subscriptionStatus === "CANCELLED" ||
      (subscriptionStatus === "PAST_DUE" &&
        gracePeriodEndsAt !== null &&
        gracePeriodEndsAt < new Date());
    if (lapsed) redirect("/billing/suspended");
  }

  // Build a minimal user object for LayoutShell (which expects the session user shape)
  const user = {
    id: ctx.userId,
    email: ctx.userEmail,
    name: ctx.userName,
    role: ctx.role,
  };

  return (
    <WeddingProvider weddingId={ctx.weddingId} role={ctx.role} subscriptionStatus={weddingBilling?.subscriptionStatus ?? "TRIALING"}>
      <RefreshProvider>
        <FormDirtyProvider>
          {weddingBilling && (
            <GracePeriodBanner
              subscriptionStatus={weddingBilling.subscriptionStatus}
              gracePeriodEndsAt={weddingBilling.gracePeriodEndsAt}
            />
          )}
          <LayoutShell user={user} failedLoginCount={failedLoginCount}>
            <InactivityTimer />
            {children}
          </LayoutShell>
        </FormDirtyProvider>
      </RefreshProvider>
    </WeddingProvider>
  );
}
