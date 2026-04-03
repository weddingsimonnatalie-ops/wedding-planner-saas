-- Add index on StripeEvent.processedAt to support efficient cleanup of old idempotency records
CREATE INDEX "StripeEvent_processedAt_idx" ON "StripeEvent"("processedAt");
