export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerContext } from "@/lib/server-context";
import { LayoutShell } from "@/components/LayoutShell";
import { InactivityTimer } from "@/components/auth/InactivityTimer";
import { RefreshProvider } from "@/context/RefreshContext";
import { FormDirtyProvider } from "@/context/FormDirtyContext";
import { WeddingProvider, type EventNamesConfig } from "@/context/WeddingContext";
import { GracePeriodBanner } from "@/components/billing/GracePeriodBanner";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getServerContext();
  if (!ctx) redirect("/login");

  const [failedLoginCount, weddingBilling, weddingCount] = await Promise.all([
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
      select: {
        subscriptionStatus: true,
        currentPeriodEnd: true,
        themeHue: true,
        currencySymbol: true,
        ceremonyEnabled: true,
        ceremonyName: true,
        ceremonyMealsEnabled: true,
        mealEnabled: true,
        mealName: true,
        mealMealsEnabled: true,
        eveningPartyEnabled: true,
        eveningPartyName: true,
        eveningPartyMealsEnabled: true,
        rehearsalDinnerEnabled: true,
        rehearsalDinnerName: true,
        rehearsalDinnerMealsEnabled: true,
      },
    }),
    prisma.weddingMember.count({ where: { userId: ctx.userId } }),
  ]);

  // Subscription gate — redirect lapsed PAST_DUE users (past their billing period end) to billing/suspended
  // FREE users have dashboard access with feature gates applied at the page level
  if (weddingBilling) {
    const { subscriptionStatus, currentPeriodEnd } = weddingBilling;
    const lapsed =
      subscriptionStatus === "PAST_DUE" &&
      currentPeriodEnd !== null &&
      currentPeriodEnd < new Date();
    if (lapsed) redirect("/billing/suspended");
  }

  // Build a minimal user object for LayoutShell (which expects the session user shape)
  const user = {
    id: ctx.userId,
    email: ctx.userEmail,
    name: ctx.userName,
    role: ctx.role,
  };

  const themeHue = weddingBilling?.themeHue ?? 330;
  // Defense-in-depth: clamp to valid HSL hue range before injecting into CSS
  const safeHue = Math.max(0, Math.min(359, Number(themeHue) || 330));
  const currencySymbol = weddingBilling?.currencySymbol ?? "£";

  const eventNames: EventNamesConfig = {
    ceremonyEnabled: weddingBilling?.ceremonyEnabled ?? true,
    ceremonyName: weddingBilling?.ceremonyName ?? "Ceremony",
    ceremonyMealsEnabled: weddingBilling?.ceremonyMealsEnabled ?? false,
    mealEnabled: weddingBilling?.mealEnabled ?? true,
    mealName: weddingBilling?.mealName ?? "Wedding Breakfast",
    mealMealsEnabled: weddingBilling?.mealMealsEnabled ?? true,
    eveningPartyEnabled: weddingBilling?.eveningPartyEnabled ?? true,
    eveningPartyName: weddingBilling?.eveningPartyName ?? "Evening Reception",
    eveningPartyMealsEnabled: weddingBilling?.eveningPartyMealsEnabled ?? false,
    rehearsalDinnerEnabled: weddingBilling?.rehearsalDinnerEnabled ?? false,
    rehearsalDinnerName: weddingBilling?.rehearsalDinnerName ?? "Rehearsal Dinner",
    rehearsalDinnerMealsEnabled: weddingBilling?.rehearsalDinnerMealsEnabled ?? false,
  };

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: `:root { --primary: ${safeHue} 60% 55%; --ring: ${safeHue} 60% 55%; }` }} />
    <WeddingProvider weddingId={ctx.weddingId} role={ctx.role} subscriptionStatus={weddingBilling?.subscriptionStatus ?? "FREE"} currencySymbol={currencySymbol} eventNames={eventNames}>
      <RefreshProvider>
        <FormDirtyProvider>
          {weddingBilling && (
            <GracePeriodBanner
              subscriptionStatus={weddingBilling.subscriptionStatus}
              currentPeriodEnd={weddingBilling.currentPeriodEnd}
            />
          )}
          <LayoutShell user={user} failedLoginCount={failedLoginCount} weddingCount={weddingCount}>
            <InactivityTimer />
            {children}
          </LayoutShell>
        </FormDirtyProvider>
      </RefreshProvider>
    </WeddingProvider>
    </>
  );
}