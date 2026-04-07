-- Add eventId column to MealOption (default to 'meal' for existing options)
ALTER TABLE "MealOption" ADD COLUMN "eventId" TEXT NOT NULL DEFAULT 'meal';

-- Create GuestMealChoice table
CREATE TABLE "GuestMealChoice" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "mealOptionId" TEXT,
    CONSTRAINT "GuestMealChoice_pkey" PRIMARY KEY ("id")
);

-- Add indexes for GuestMealChoice
CREATE INDEX "GuestMealChoice_guestId_idx" ON "GuestMealChoice"("guestId");
CREATE INDEX "GuestMealChoice_mealOptionId_idx" ON "GuestMealChoice"("mealOptionId");

-- Add unique constraint for guestId + eventId
ALTER TABLE "GuestMealChoice" ADD CONSTRAINT "GuestMealChoice_guestId_eventId_key" UNIQUE ("guestId", "eventId");

-- Add foreign key constraints
ALTER TABLE "GuestMealChoice" ADD CONSTRAINT "GuestMealChoice_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestMealChoice" ADD CONSTRAINT "GuestMealChoice_mealOptionId_fkey" FOREIGN KEY ("mealOptionId") REFERENCES "MealOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate existing meal choices to GuestMealChoice
-- Insert from Guest.mealChoice where it's not null
INSERT INTO "GuestMealChoice" ("id", "guestId", "eventId", "mealOptionId")
SELECT
    gen_random_uuid(),
    "id",
    'meal',
    "mealChoice"
FROM "Guest"
WHERE "mealChoice" IS NOT NULL;

-- Add mealsEnabled fields to Wedding
ALTER TABLE "Wedding" ADD COLUMN "ceremonyMealsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Wedding" ADD COLUMN "mealMealsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Wedding" ADD COLUMN "eveningPartyMealsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Wedding" ADD COLUMN "rehearsalDinnerMealsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Add index for MealOption by eventId
CREATE INDEX "MealOption_weddingId_eventId_idx" ON "MealOption"("weddingId", "eventId");

-- Add unique constraint for weddingId + eventId + name
ALTER TABLE "MealOption" ADD CONSTRAINT "MealOption_weddingId_eventId_name_key" UNIQUE ("weddingId", "eventId", "name");