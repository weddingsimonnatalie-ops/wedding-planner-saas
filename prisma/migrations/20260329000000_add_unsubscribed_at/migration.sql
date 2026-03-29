-- Add unsubscribedAt field to Guest model for GDPR email unsubscribe
ALTER TABLE "Guest" ADD COLUMN "unsubscribedAt" TIMESTAMP(3);