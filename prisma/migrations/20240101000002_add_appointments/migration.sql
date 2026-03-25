-- Create AppointmentCategory enum
CREATE TYPE "AppointmentCategory" AS ENUM (
  'FITTING', 'TASTING', 'REHEARSAL', 'CONSULTATION',
  'VIEWING', 'CEREMONY_PRACTICE', 'OTHER'
);

-- Create Appointment table
CREATE TABLE "Appointment" (
  "id"           TEXT                    NOT NULL,
  "title"        TEXT                    NOT NULL,
  "category"     "AppointmentCategory"   NOT NULL DEFAULT 'OTHER',
  "date"         TIMESTAMP(3)            NOT NULL,
  "location"     TEXT,
  "notes"        TEXT,
  "supplierId"   TEXT,
  "reminderDays" INTEGER,
  "reminderSent" BOOLEAN                 NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)            NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
