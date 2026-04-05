-- CreateEnum
CREATE TYPE "PlanningCategoryType" AS ENUM ('SUPPLIER', 'APPOINTMENT', 'TASK');

-- CreateTable: unified planning category
CREATE TABLE "PlanningCategory" (
  "id"              TEXT NOT NULL,
  "weddingId"       TEXT NOT NULL,
  "entityType"      "PlanningCategoryType" NOT NULL,
  "name"            TEXT NOT NULL,
  "colour"          TEXT NOT NULL DEFAULT '#6366f1',
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "allocatedAmount" DOUBLE PRECISION,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlanningCategory_pkey" PRIMARY KEY ("id")
);

-- Migrate data from SupplierCategory (preserving IDs)
INSERT INTO "PlanningCategory" ("id","weddingId","entityType","name","colour","sortOrder","isActive","allocatedAmount","createdAt")
  SELECT "id","weddingId",'SUPPLIER'::"PlanningCategoryType","name","colour","sortOrder","isActive","allocatedAmount","createdAt"
  FROM "SupplierCategory";

-- Migrate data from AppointmentCategory
INSERT INTO "PlanningCategory" ("id","weddingId","entityType","name","colour","sortOrder","isActive","createdAt")
  SELECT "id","weddingId",'APPOINTMENT'::"PlanningCategoryType","name","colour","sortOrder","isActive","createdAt"
  FROM "AppointmentCategory";

-- Migrate data from TaskCategory
INSERT INTO "PlanningCategory" ("id","weddingId","entityType","name","colour","sortOrder","isActive","createdAt")
  SELECT "id","weddingId",'TASK'::"PlanningCategoryType","name","colour","sortOrder","isActive","createdAt"
  FROM "TaskCategory";

-- CreateIndex
CREATE INDEX "PlanningCategory_weddingId_idx" ON "PlanningCategory"("weddingId");
CREATE INDEX "PlanningCategory_weddingId_entityType_idx" ON "PlanningCategory"("weddingId","entityType");

-- AddForeignKey: PlanningCategory -> Wedding
ALTER TABLE "PlanningCategory" ADD CONSTRAINT "PlanningCategory_weddingId_fkey"
  FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Retarget FK constraints from old tables to PlanningCategory
-- (IDs are preserved, so no data updates needed in child tables)
ALTER TABLE "Supplier"    DROP CONSTRAINT "Supplier_categoryId_fkey";
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_categoryId_fkey";
ALTER TABLE "Task"        DROP CONSTRAINT "Task_categoryId_fkey";

ALTER TABLE "Supplier"    ADD CONSTRAINT "Supplier_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "PlanningCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "PlanningCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task"        ADD CONSTRAINT "Task_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "PlanningCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable: old category tables
DROP TABLE "SupplierCategory";
DROP TABLE "AppointmentCategory";
DROP TABLE "TaskCategory";
