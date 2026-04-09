-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "completedAt" TIMESTAMP(3);