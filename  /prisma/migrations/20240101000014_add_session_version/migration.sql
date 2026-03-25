-- Add sessionVersion field to User for JWT invalidation
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;