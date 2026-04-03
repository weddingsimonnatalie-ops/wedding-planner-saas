-- Add billing provider enum (idempotent — skip if already exists)
DO $$ BEGIN
  CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'PAYPAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to Wedding (idempotent)
ALTER TABLE "Wedding"
  ADD COLUMN IF NOT EXISTS "billingProvider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
  ADD COLUMN IF NOT EXISTS "paypalSubscriptionId" TEXT;

ALTER TABLE "Wedding"
  DROP CONSTRAINT IF EXISTS "Wedding_paypalSubscriptionId_key";
ALTER TABLE "Wedding"
  ADD CONSTRAINT "Wedding_paypalSubscriptionId_key" UNIQUE ("paypalSubscriptionId");

-- PayPal idempotency table (mirrors StripeEvent)
CREATE TABLE IF NOT EXISTS "PayPalEvent" (
  "id"          TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayPalEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PayPalEvent_eventId_key" ON "PayPalEvent"("eventId");