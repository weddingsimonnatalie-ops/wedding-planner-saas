-- Add timezone column to Wedding table
ALTER TABLE "Wedding" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Europe/London';