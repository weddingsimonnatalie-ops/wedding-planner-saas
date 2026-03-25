-- Add Maybe response fields to Guest
ALTER TABLE "Guest" ADD COLUMN "attendingCeremonyMaybe"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guest" ADD COLUMN "attendingReceptionMaybe"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guest" ADD COLUMN "attendingAfterpartyMaybe" BOOLEAN NOT NULL DEFAULT false;
