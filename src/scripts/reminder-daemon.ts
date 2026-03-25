/**
 * Appointment reminder daemon — run as a background process via tsx.
 * Checks for due reminders immediately on startup, then every 60 minutes.
 * Started by entrypoint.sh alongside `next start`.
 */
import { startReminderJob } from "../lib/appointmentReminders";

startReminderJob();

// Keep the process alive
process.on("SIGTERM", () => {
  console.log("[reminders] Daemon stopping (SIGTERM)");
  process.exit(0);
});
