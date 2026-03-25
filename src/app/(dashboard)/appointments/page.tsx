export const dynamic = "force-dynamic";

import { AppointmentsList } from "@/components/appointments/AppointmentsList";

export default function AppointmentsPage() {
  return (
    <div className="max-w-3xl">
      <AppointmentsList />
    </div>
  );
}
