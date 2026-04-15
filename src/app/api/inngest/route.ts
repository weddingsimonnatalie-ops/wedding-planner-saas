import { serve } from "inngest/next";
import {
  inngest,
  appointmentReminders,
  markOverduePayments,
  gracePeriodExpiry,
  paymentFailureEmail,
  welcomeEmail,
  cancellationDataExport,
  purgeExpiredWeddings,
  preDeletionWarning,
  stripeReconcile,
  stripeSyncDelayed,
  purgeAuditLogs,
} from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    appointmentReminders,
    markOverduePayments,
    gracePeriodExpiry,
    paymentFailureEmail,
    welcomeEmail,
    cancellationDataExport,
    purgeExpiredWeddings,
    preDeletionWarning,
    stripeReconcile,
    stripeSyncDelayed,
    purgeAuditLogs,
  ],
});
