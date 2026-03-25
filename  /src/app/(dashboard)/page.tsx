import { getSession } from "@/lib/session";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  return (
    <ErrorBoundary label="Dashboard">
      <DashboardClient
        userName={session?.user?.name ?? session?.user?.email ?? undefined}
        role={session?.user?.role}
      />
    </ErrorBoundary>
  );
}
