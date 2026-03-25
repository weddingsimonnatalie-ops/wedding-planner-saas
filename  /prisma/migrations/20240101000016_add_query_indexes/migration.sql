-- Add indexes for frequently queried fields

-- Guest email lookup (duplicate check on create/update)
CREATE INDEX "Guest_email_idx" ON "Guest"("email") WHERE "email" IS NOT NULL;

-- Payment status + due date (dashboard upcoming/overdue payments)
CREATE INDEX "Payment_status_dueDate_idx" ON "Payment"("status", "dueDate");

-- Appointment date (dashboard upcoming appointments)
CREATE INDEX "Appointment_date_idx" ON "Appointment"("date");