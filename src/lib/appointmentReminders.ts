import { prisma } from "@/lib/prisma";
import { sendAppointmentReminderEmail } from "@/lib/email";

export async function checkAppointmentReminders(): Promise<{ checked: number; sent: number }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Find all unsent appointments that have a reminder set
  const [appointments, config] = await Promise.all([
    prisma.appointment.findMany({
      where: { reminderDays: { not: null }, reminderSent: false },
      include: {
        supplier: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
    prisma.weddingConfig.findFirst(),
  ]);

  const adminEmail = config?.reminderEmail || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  let sent = 0;

  for (const appt of appointments) {
    if (appt.reminderDays == null) continue;

    // Calculate the date when the reminder should fire
    const reminderDate = new Date(appt.date.getTime() - appt.reminderDays * 24 * 60 * 60 * 1000);

    // Check if reminderDate falls within today
    if (reminderDate >= todayStart && reminderDate <= todayEnd) {
      const result = await sendAppointmentReminderEmail(
        adminEmail,
        appt.title,
        appt.category?.name ?? "Other",
        appt.date,
        appt.reminderDays,
        appt.location,
        appt.supplier?.name ?? null,
        appt.notes
      );

      if (result.ok) {
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { reminderSent: true },
        });
        sent++;
      }

      console.log(`[reminders] ${appt.title}: ${result.message}`);
    }
  }

  console.log(`[reminders] Checked ${appointments.length} appointments, sent ${sent} reminders`);
  return { checked: appointments.length, sent };
}

export function startReminderJob() {
  console.log("[reminders] Starting appointment reminder job (interval: 60 min)");

  // Run immediately on startup
  checkAppointmentReminders().catch(err =>
    console.error("[reminders] Error on startup check:", err)
  );

  // Then every 60 minutes
  setInterval(() => {
    checkAppointmentReminders().catch(err =>
      console.error("[reminders] Error on interval check:", err)
    );
  }, 60 * 60 * 1000);
}
