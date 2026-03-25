export const dynamic = "force-dynamic";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { LayoutShell } from "@/components/LayoutShell";
import { InactivityTimer } from "@/components/auth/InactivityTimer";
import { RefreshProvider } from "@/context/RefreshContext";
import { FormDirtyProvider } from "@/context/FormDirtyContext";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const failedLoginCount = session.user?.email
    ? await prisma.loginAttempt.count({
        where: {
          email: session.user.email,
          success: false,
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      })
    : 0;

  return (
    <RefreshProvider>
      <FormDirtyProvider>
        <LayoutShell user={session.user} failedLoginCount={failedLoginCount}>
          <InactivityTimer />
          {children}
        </LayoutShell>
      </FormDirtyProvider>
    </RefreshProvider>
  );
}
