-- Create enum
CREATE TYPE "TimelineEventType" AS ENUM ('PREP', 'TRANSPORT', 'CEREMONY', 'PHOTO', 'RECEPTION', 'FOOD', 'MUSIC', 'GENERAL');

-- Create TimelineEvent table
CREATE TABLE "TimelineEvent" (
  "id" TEXT NOT NULL,
  "weddingId" TEXT NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "durationMins" INTEGER NOT NULL DEFAULT 30,
  "title" TEXT NOT NULL,
  "location" TEXT,
  "notes" TEXT,
  "eventType" "TimelineEventType" NOT NULL DEFAULT 'GENERAL',
  "supplierId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "TimelineEvent_weddingId_idx" ON "TimelineEvent"("weddingId");
CREATE INDEX "TimelineEvent_weddingId_startTime_idx" ON "TimelineEvent"("weddingId", "startTime");

-- Add foreign keys
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_weddingId_fkey"
  FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;