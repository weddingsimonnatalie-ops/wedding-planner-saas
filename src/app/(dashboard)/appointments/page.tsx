export const dynamic = "force-dynamic";

import { AppointmentsList } from "@/components/appointments/AppointmentsList";
import { requireServerContext } from "@/lib/server-context";

export default async function AppointmentsPage() {
  await requireServerContext(["ADMIN", "VIEWER"]);
  return (
    <div className="max-w-3xl">
      <AppointmentsList />
    </div>
  );
}
