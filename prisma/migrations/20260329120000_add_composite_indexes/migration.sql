-- Add composite indexes for frequently queried columns
-- Guest: weddingId + email (duplicate email check)
-- Appointment: weddingId + date (dashboard stats and appointment count)

CREATE INDEX "Guest_weddingId_email_idx" ON "Guest"("weddingId", "email");
CREATE INDEX "Appointment_weddingId_date_idx" ON "Appointment"("weddingId", "date");