-- Add billing provider enum
CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'PAYPAL');

-- Add new columns to Wedding
ALTER TABLE "Wedding"
  ADD COLUMN "billingProvider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
  ADD COLUMN "paypalSubscriptionId" TEXT UNIQUE;

-- PayPal idempotency table (mirrors StripeEvent)
CREATE TABLE "PayPalEvent" (
  "id"          TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayPalEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayPalEvent_eventId_key" ON "PayPalEvent"("eventId");