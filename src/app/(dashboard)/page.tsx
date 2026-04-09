import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { requireServerContext } from "@/lib/server-context";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireServerContext();
  return (
    <ErrorBoundary label="Dashboard">
      <DashboardClient
        userName={ctx.userName ?? ctx.userEmail ?? undefined}
        role={ctx.role}
        dashboardLayout={ctx.dashboardLayout}
      />
    </ErrorBoundary>
  );
}
