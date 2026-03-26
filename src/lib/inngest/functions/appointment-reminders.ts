import { inngest } from "@/lib/inngest/client";
import { checkAppointmentReminders } from "@/lib/appointmentReminders";

export const appointmentReminders = inngest.createFunction(
  { id: "appointment-reminders", name: "Appointment Reminders", triggers: [{ cron: "0 * * * *" }] },
  async () => {
    const result = await checkAppointmentReminders();
    return result;
  }
);
