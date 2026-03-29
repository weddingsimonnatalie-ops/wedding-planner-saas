import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant";
import { sendAppointmentReminderEmail } from "@/lib/email";

export async function checkAppointmentReminders(): Promise<{ checked: number; sent: number }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Only send reminders for paid subscriptions (ACTIVE or PAST_DUE within grace period)
  const activeWeddings = await prisma.wedding.findMany({
    where: {
      subscriptionStatus: { in: ["ACTIVE", "PAST_DUE"] },
    },
    select: { id: true, reminderEmail: true },
  });

  let totalChecked = 0;
  let totalSent = 0;

  for (const wedding of activeWeddings) {
    const adminEmail =
      wedding.reminderEmail || process.env.SMTP_FROM || process.env.SMTP_USER || "";
    if (!adminEmail) continue;

    const appointments = await withTenantContext(wedding.id, (tx) =>
      tx.appointment.findMany({
        where: {
          weddingId: wedding.id,
          reminderDays: { not: null },
          reminderSent: false,
        },
        include: {
          supplier: { select: { name: true } },
          category: { select: { name: true } },
        },
      })
    );

    totalChecked += appointments.length;

    for (const appt of appointments) {
      if (appt.reminderDays == null) continue;

      const reminderDate = new Date(
        appt.date.getTime() - appt.reminderDays * 24 * 60 * 60 * 1000
      );

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
          await withTenantContext(wedding.id, (tx) =>
            tx.appointment.update({
              where: { id: appt.id },
              data: { reminderSent: true },
            })
          );
          totalSent++;
        }

        console.log(`[reminders] ${appt.title} (${wedding.id}): ${result.message}`);
      }
    }
  }

  console.log(
    `[reminders] Checked ${totalChecked} appointments across ${activeWeddings.length} weddings, sent ${totalSent} reminders`
  );
  return { checked: totalChecked, sent: totalSent };
}

export function startReminderJob() {
  console.log("[reminders] Starting appointment reminder job (interval: 60 min)");

  checkAppointmentReminders().catch((err) =>
    console.error("[reminders] Error on startup check:", err)
  );

  setInterval(() => {
    checkAppointmentReminders().catch((err) =>
      console.error("[reminders] Error on interval check:", err)
    );
  }, 60 * 60 * 1000);
}
