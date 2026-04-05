-- Migrate any MAYBE guests to PENDING and clear their attending fields
UPDATE "Guest"
SET
  "rsvpStatus"       = 'PENDING',
  "rsvpRespondedAt"  = NULL,
  "attendingCeremony"       = NULL,
  "attendingReception"      = NULL,
  "attendingAfterparty"     = NULL,
  "attendingRehearsalDinner" = NULL
WHERE "rsvpStatus" = 'MAYBE';

-- Drop the attending*Maybe columns
ALTER TABLE "Guest"
  DROP COLUMN "attendingCeremonyMaybe",
  DROP COLUMN "attendingReceptionMaybe",
  DROP COLUMN "attendingAfterpartyMaybe",
  DROP COLUMN "attendingRehearsalDinnerMaybe";

-- Recreate RsvpStatus enum without MAYBE
-- PostgreSQL requires dropping the column default before altering the type,
-- because the default contains a reference to the old type name.
ALTER TABLE "Guest" ALTER COLUMN "rsvpStatus" DROP DEFAULT;

ALTER TYPE "RsvpStatus" RENAME TO "RsvpStatus_old";
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PARTIAL', 'DECLINED');
ALTER TABLE "Guest"
  ALTER COLUMN "rsvpStatus" TYPE "RsvpStatus"
  USING "rsvpStatus"::text::"RsvpStatus";
DROP TYPE "RsvpStatus_old";

-- Restore the default
ALTER TABLE "Guest" ALTER COLUMN "rsvpStatus" SET DEFAULT 'PENDING'::"RsvpStatus";
