-- Subscription Model Redesign
-- Replace TRIALING/CANCELLED/PAUSED with FREE, remove PayPal, remove trial/grace fields

-- Step 1: Change subscriptionStatus column to text so we can update values freely
ALTER TABLE "Wedding" ALTER COLUMN "subscriptionStatus" TYPE text;

-- Step 2: Migrate data — convert old statuses to FREE
UPDATE "Wedding" SET "subscriptionStatus" = 'FREE' WHERE "subscriptionStatus" IN ('TRIALING', 'CANCELLED', 'PAUSED');

-- Step 3: Backfill deleteScheduledAt for FREE weddings that don't have one
UPDATE "Wedding"
SET "deleteScheduledAt" = CASE
  WHEN "weddingDate" IS NOT NULL THEN "weddingDate" + INTERVAL '60 days'
  ELSE "createdAt" + INTERVAL '365 days'
END
WHERE "subscriptionStatus" = 'FREE'
  AND "deleteScheduledAt" IS NULL;

-- Step 4: Delete PayPalEvent rows
DELETE FROM "PayPalEvent";

-- Step 5: Drop PayPalEvent table
DROP TABLE "PayPalEvent";

-- Step 6: Remove columns from Wedding
ALTER TABLE "Wedding" DROP COLUMN IF EXISTS "trialEndsAt";
ALTER TABLE "Wedding" DROP COLUMN IF EXISTS "gracePeriodEndsAt";
ALTER TABLE "Wedding" DROP COLUMN IF EXISTS "subscriptionPlan";
ALTER TABLE "Wedding" DROP COLUMN IF EXISTS "paypalSubscriptionId";
ALTER TABLE "Wedding" DROP COLUMN IF EXISTS "billingProvider";

-- Step 7: Drop the default (references old SubStatus enum), drop old enum, create new enum,
--         convert column, set new default — all in one statement to avoid type conflicts
ALTER TABLE "Wedding" ALTER COLUMN "subscriptionStatus" DROP DEFAULT;
DROP TYPE "SubStatus";
CREATE TYPE "SubStatus" AS ENUM ('FREE', 'ACTIVE', 'PAST_DUE');
ALTER TABLE "Wedding" ALTER COLUMN "subscriptionStatus" TYPE "SubStatus" USING ("subscriptionStatus"::"SubStatus");
ALTER TABLE "Wedding" ALTER COLUMN "subscriptionStatus" SET DEFAULT 'FREE'::"SubStatus";

-- Step 8: Drop BillingProvider enum
DROP TYPE "BillingProvider";