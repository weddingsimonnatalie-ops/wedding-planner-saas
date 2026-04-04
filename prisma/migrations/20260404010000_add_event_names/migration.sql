-- Add event name configuration to Wedding
ALTER TABLE "Wedding" ADD COLUMN "ceremonyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Wedding" ADD COLUMN "ceremonyName" TEXT NOT NULL DEFAULT 'Ceremony';
ALTER TABLE "Wedding" ADD COLUMN "mealEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Wedding" ADD COLUMN "mealName" TEXT NOT NULL DEFAULT 'Wedding Breakfast';
ALTER TABLE "Wedding" ADD COLUMN "eveningPartyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Wedding" ADD COLUMN "eveningPartyName" TEXT NOT NULL DEFAULT 'Evening Reception';
ALTER TABLE "Wedding" ADD COLUMN "rehearsalDinnerEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Wedding" ADD COLUMN "rehearsalDinnerName" TEXT NOT NULL DEFAULT 'Rehearsal Dinner';

-- Add rehearsal dinner fields to Guest
ALTER TABLE "Guest" ADD COLUMN "invitedToRehearsalDinner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guest" ADD COLUMN "attendingRehearsalDinner" BOOLEAN;
ALTER TABLE "Guest" ADD COLUMN "attendingRehearsalDinnerMaybe" BOOLEAN NOT NULL DEFAULT false;