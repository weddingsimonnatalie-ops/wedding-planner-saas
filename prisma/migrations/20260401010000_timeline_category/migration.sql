-- CreateTable
CREATE TABLE "TimelineCategory" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT '#6366f1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineCategory_pkey" PRIMARY KEY ("id")
);

-- Create index
CREATE INDEX "TimelineCategory_weddingId_idx" ON "TimelineCategory"("weddingId");

-- Add foreign key constraint
ALTER TABLE "TimelineCategory" ADD CONSTRAINT "TimelineCategory_weddingId_fkey"
    FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add categoryId column to TimelineEvent (nullable)
ALTER TABLE "TimelineEvent" ADD COLUMN "categoryId" TEXT;

-- Add foreign key constraint for categoryId
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TimelineCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for categoryId
CREATE INDEX "TimelineEvent_categoryId_idx" ON "TimelineEvent"("categoryId");

-- Insert default categories for each wedding
-- Prep (pink), Transport (blue), Ceremony (purple), Photo (amber), Reception (green), Food (orange), Music (indigo), General (gray)
INSERT INTO "TimelineCategory" ("id", "weddingId", "name", "colour", "sortOrder")
SELECT
    gen_random_uuid(),
    "w"."id",
    'Prep',
    '#fce7f3',
    10
FROM "Wedding" "w";

INSERT INTO "TimelineCategory" ("id", "weddingId", "name", "colour", "sortOrder")
SELECT
    gen_random_uuid(),
    "w"."id",
    'Transport',
    '#dbeafe',
    20
FROM "Wedding" "w";

INSERT INTO "TimelineCategory" ("id", "weddingId", "name", "colour", "sortOrder")
SELECT
    gen_random_uuid(),
    "w"."id",
    'Ceremony',
    '#f3e8ff',
    30
FROM "Wedding" "w";

INSERT INTO "TimelineCategory" ("id", "weddingId", "name", "colour", "sortOrder")
SELECT
    gen_random_uuid(),
    "w"."id",
    'Photo',
    '#fef3c7',
    40
FROM "Wedding" "w";

INSERT INTO "TimelineCategory" ("id", "weddingId", "name", "colour", "sortOrder")
SELECT
    gen_random_uuid(),
    "w"."id",
    'Reception',
    '#dcfce7',
    50
FROM "Wedding" "w";

INSERT INTO "TimelineCategory" ("id", "weddingId", "name", "colour", "sortOrder")
SELECT
    gen_random_uuid(),
    "w"."id",
    'Food',
    '#ffedd5',
    60
FROM "Wedding" "w";

INSERT INTO "TimelineCategory" ("id", "weddingId", "name", "colour", "sortOrder")
SELECT
    gen_random_uuid(),
    "w"."id",
    'Music',
    '#e0e7ff',
    70
FROM "Wedding" "w";

INSERT INTO "TimelineCategory" ("id", "weddingId", "name", "colour", "sortOrder")
SELECT
    gen_random_uuid(),
    "w"."id",
    'General',
    '#f3f4f6',
    80
FROM "Wedding" "w";

-- Update existing TimelineEvent rows to set categoryId based on eventType
UPDATE "TimelineEvent" "te"
SET "categoryId" = "tc"."id"
FROM "TimelineCategory" "tc"
WHERE "tc"."weddingId" = "te"."weddingId"
  AND "tc"."name" = CASE "te"."eventType"
    WHEN 'PREP' THEN 'Prep'
    WHEN 'TRANSPORT' THEN 'Transport'
    WHEN 'CEREMONY' THEN 'Ceremony'
    WHEN 'PHOTO' THEN 'Photo'
    WHEN 'RECEPTION' THEN 'Reception'
    WHEN 'FOOD' THEN 'Food'
    WHEN 'MUSIC' THEN 'Music'
    WHEN 'GENERAL' THEN 'General'
  END;

-- Remove eventType column
ALTER TABLE "TimelineEvent" DROP COLUMN "eventType";

-- Drop the enum
DROP TYPE "TimelineEventType";