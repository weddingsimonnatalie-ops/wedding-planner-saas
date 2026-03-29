import { serve } from "inngest/next";
import {
  inngest,
  appointmentReminders,
  markOverduePayments,
  gracePeriodExpiry,
  trialEndingReminder,
  paymentFailureEmail,
  welcomeEmail,
  cancellationDataExport,
  purgeExpiredWeddings,
  preDeletionWarning,
  stripeReconcile,
  stripeSyncDelayed,
} from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    appointmentReminders,
    markOverduePayments,
    gracePeriodExpiry,
    trialEndingReminder,
    paymentFailureEmail,
    welcomeEmail,
    cancellationDataExport,
    purgeExpiredWeddings,
    preDeletionWarning,
    stripeReconcile,
    stripeSyncDelayed,
  ],
});
