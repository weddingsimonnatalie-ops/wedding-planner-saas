-- Remove top-level venue name/address fields from Wedding (replaced by per-event locations)
ALTER TABLE "Wedding" DROP COLUMN IF EXISTS "venueName";
ALTER TABLE "Wedding" DROP COLUMN IF EXISTS "venueAddress";
