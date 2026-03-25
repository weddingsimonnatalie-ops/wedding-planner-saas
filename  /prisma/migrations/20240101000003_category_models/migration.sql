-- 1. Create SupplierCategory table
CREATE TABLE "SupplierCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "colour" TEXT NOT NULL DEFAULT '#6366f1',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierCategory_name_key" UNIQUE ("name")
);

-- 2. Populate SupplierCategory from existing distinct supplier category strings
INSERT INTO "SupplierCategory" ("id", "name", "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, category, (ROW_NUMBER() OVER (ORDER BY category) - 1) * 10, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT category FROM "Supplier" WHERE category IS NOT NULL AND category != '') t;

-- 3. Add default categories that might not exist yet (using DO block to handle conflicts)
DO $$
DECLARE
  cats TEXT[] := ARRAY['Venue','Catering','Photography','Videography','Florist','Music / DJ','Cake','Dress / Attire','Transport','Stationery','Hair & Makeup','Jewellery','Accommodation','Other'];
  i INT;
  cat TEXT;
BEGIN
  FOR i IN 1..array_length(cats, 1) LOOP
    cat := cats[i];
    INSERT INTO "SupplierCategory" ("id", "name", "sortOrder", "createdAt")
    VALUES (gen_random_uuid()::text, cat, (i - 1) * 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("name") DO UPDATE SET "sortOrder" = LEAST("SupplierCategory"."sortOrder", (i - 1) * 10);
  END LOOP;
END $$;

-- 4. Add categoryId column to Supplier
ALTER TABLE "Supplier" ADD COLUMN "categoryId" TEXT;

-- 5. Set categoryId from existing category string
UPDATE "Supplier" s
SET "categoryId" = sc.id
FROM "SupplierCategory" sc
WHERE sc.name = s.category;

-- 6. Add FK constraint on Supplier
ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "SupplierCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Drop old category column from Supplier
ALTER TABLE "Supplier" DROP COLUMN "category";

-- 8. Create temp AppointmentCategory table (can't use final name yet because of enum type conflict)
CREATE TABLE "_ApptCatNew" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "colour" TEXT NOT NULL DEFAULT '#6366f1',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "_ApptCatNew_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "_ApptCatNew_name_key" UNIQUE ("name")
);

-- 9. Insert appointment categories with sort order
INSERT INTO "_ApptCatNew" ("id", "name", "sortOrder", "createdAt") VALUES
  (gen_random_uuid()::text, 'Fitting', 0, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Tasting', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Rehearsal', 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Consultation', 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Viewing', 40, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Ceremony Practice', 50, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Other', 60, CURRENT_TIMESTAMP);

-- 10. Add categoryId to Appointment (nullable)
ALTER TABLE "Appointment" ADD COLUMN "categoryId" TEXT;

-- 11. Map old enum values to new category records
UPDATE "Appointment" a
SET "categoryId" = c.id
FROM "_ApptCatNew" c
WHERE c.name = CASE a.category::text
  WHEN 'FITTING' THEN 'Fitting'
  WHEN 'TASTING' THEN 'Tasting'
  WHEN 'REHEARSAL' THEN 'Rehearsal'
  WHEN 'CONSULTATION' THEN 'Consultation'
  WHEN 'VIEWING' THEN 'Viewing'
  WHEN 'CEREMONY_PRACTICE' THEN 'Ceremony Practice'
  ELSE 'Other'
END;

-- 12. Drop old category column from Appointment
ALTER TABLE "Appointment" DROP COLUMN "category";

-- 13. Drop the old AppointmentCategory enum type
DROP TYPE "AppointmentCategory";

-- 14. Rename temp table to final name
ALTER TABLE "_ApptCatNew" RENAME TO "AppointmentCategory";
ALTER INDEX "_ApptCatNew_pkey" RENAME TO "AppointmentCategory_pkey";
ALTER INDEX "_ApptCatNew_name_key" RENAME TO "AppointmentCategory_name_key";

-- 15. Add FK on Appointment
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "AppointmentCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
