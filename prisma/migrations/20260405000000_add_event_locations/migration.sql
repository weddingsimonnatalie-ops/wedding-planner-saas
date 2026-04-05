-- Add per-event location fields to Wedding
ALTER TABLE "Wedding" ADD COLUMN "ceremonyLocation"        TEXT;
ALTER TABLE "Wedding" ADD COLUMN "mealLocation"            TEXT;
ALTER TABLE "Wedding" ADD COLUMN "eveningPartyLocation"    TEXT;
ALTER TABLE "Wedding" ADD COLUMN "rehearsalDinnerLocation" TEXT;
