# Plan: Merge Supplier / Appointment / Task Categories into PlanningCategory

## Goal
Replace three separate DB tables (`SupplierCategory`, `AppointmentCategory`, `TaskCategory`) with a single `PlanningCategory` table that has an `entityType` discriminator. Existing data is preserved via migration.

---

## Phase 1 — Database migration (manual SQL)

File: `prisma/migrations/20260405020000_add_planning_category/migration.sql`

```sql
-- 1. Create enum
CREATE TYPE "PlanningCategoryType" AS ENUM ('SUPPLIER', 'APPOINTMENT', 'TASK');

-- 2. Create unified table
CREATE TABLE "PlanningCategory" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "weddingId"       TEXT NOT NULL,
  "entityType"      "PlanningCategoryType" NOT NULL,
  "name"            TEXT NOT NULL,
  "colour"          TEXT NOT NULL DEFAULT '#6366f1',
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "allocatedAmount" DOUBLE PRECISION,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Copy data from old tables
INSERT INTO "PlanningCategory" ("id","weddingId","entityType","name","colour","sortOrder","isActive","allocatedAmount","createdAt")
  SELECT "id","weddingId",'SUPPLIER'::"PlanningCategoryType","name","colour","sortOrder","isActive","allocatedAmount","createdAt"
  FROM "SupplierCategory";

INSERT INTO "PlanningCategory" ("id","weddingId","entityType","name","colour","sortOrder","isActive","createdAt")
  SELECT "id","weddingId",'APPOINTMENT'::"PlanningCategoryType","name","colour","sortOrder","isActive","createdAt"
  FROM "AppointmentCategory";

INSERT INTO "PlanningCategory" ("id","weddingId","entityType","name","colour","sortOrder","isActive","createdAt")
  SELECT "id","weddingId",'TASK'::"PlanningCategoryType","name","colour","sortOrder","isActive","createdAt"
  FROM "TaskCategory";

-- 4. Add FK index
CREATE INDEX "PlanningCategory_weddingId_idx" ON "PlanningCategory"("weddingId");
CREATE INDEX "PlanningCategory_weddingId_entityType_idx" ON "PlanningCategory"("weddingId","entityType");

-- 5. Drop old FK constraints then old tables
-- (Supplier, Appointment, Task already reference old tables via FK — existing IDs are preserved so no FK update needed)
ALTER TABLE "Supplier"     DROP CONSTRAINT IF EXISTS "Supplier_categoryId_fkey";
ALTER TABLE "Appointment"  DROP CONSTRAINT IF EXISTS "Appointment_categoryId_fkey";
ALTER TABLE "Task"         DROP CONSTRAINT IF EXISTS "Task_categoryId_fkey";

-- 6. Re-add FK constraints pointing at new table
ALTER TABLE "Supplier"    ADD CONSTRAINT "Supplier_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "PlanningCategory"("id") ON DELETE SET NULL;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "PlanningCategory"("id") ON DELETE SET NULL;
ALTER TABLE "Task"        ADD CONSTRAINT "Task_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "PlanningCategory"("id") ON DELETE SET NULL;

-- 7. Drop old tables
DROP TABLE "SupplierCategory";
DROP TABLE "AppointmentCategory";
DROP TABLE "TaskCategory";
```

---

## Phase 2 — Prisma schema (`prisma/schema.prisma`)

Changes:
- Remove `SupplierCategory`, `AppointmentCategory`, `TaskCategory` models
- Remove relations from `Wedding` (`supplierCategories`, `appointmentCategories`, `taskCategories`)
- Add `enum PlanningCategoryType { SUPPLIER APPOINTMENT TASK }`
- Add `model PlanningCategory` with `entityType`, `allocatedAmount?`
- Add `planningCategories PlanningCategory[]` to `Wedding`
- Update `Supplier.category` → `PlanningCategory?`
- Update `Appointment.category` → `PlanningCategory?`
- Update `Task.category` → `PlanningCategory?`

---

## Phase 3 — New unified API routes

### `/api/planning-categories/route.ts`
- `GET ?type=SUPPLIER|APPOINTMENT|TASK` → filter by entityType, cache key `${weddingId}:planning-categories:${type}`
- `POST { entityType, name, colour, allocatedAmount? }` → create

### `/api/planning-categories/[id]/route.ts`
- `PUT { name?, colour?, isActive?, sortOrder?, allocatedAmount? }` → update
- `DELETE ?force=true` → check usage across all three entity tables, delete

### `/api/planning-categories/reorder/route.ts`
- `PUT { ids, entityType }` → reorder within entity type

---

## Phase 4 — Update existing API routes

Files to update:
- `src/app/api/suppliers/route.ts` — validation: `planningCategory.findFirst` instead of `supplierCategory`
- `src/app/api/suppliers/[id]/route.ts` — same
- `src/app/api/appointments/route.ts` — validation: `planningCategory.findFirst` instead of `appointmentCategory`
- `src/app/api/appointments/[id]/route.ts` — same
- `src/app/api/tasks/route.ts` — validation: `planningCategory.findFirst` instead of `taskCategory`
- `src/app/api/tasks/[id]/route.ts` — same
- `src/app/api/budget/summary/route.ts` — update category query
- `src/app/api/dashboard/stats/route.ts` — update category includes
- `src/app/api/export/route.ts` — update category references

---

## Phase 5 — Frontend components

### `src/components/settings/SettingsClient.tsx`
- Replace sub-tab logic with single `CategoriesManager` pointing at `/api/planning-categories` with `entityType` query param
- Pass `entityType` prop instead of `apiBase` to sub-tabs (or keep apiBase as `?type=SUPPLIER` etc.)

### `src/components/settings/CategoriesManager.tsx`
- `apiBase` stays; callers pass `/api/planning-categories?type=SUPPLIER` etc.
- No internal changes needed to logic

### Supplier, Appointment, Task components
- Update category fetch URL from old endpoints to `/api/planning-categories?type=SUPPLIER|APPOINTMENT|TASK`
- Files: `SupplierList.tsx`, `SupplierModal.tsx`, `SupplierDetail.tsx`, `AppointmentModal.tsx`, `AppointmentsList.tsx`, `TasksPageClient.tsx`, `TaskModal.tsx`

---

## Phase 6 — Cleanup

- Delete `src/app/api/supplier-categories/` directory
- Delete `src/app/api/appointment-categories/` directory
- Delete `src/app/api/task-categories/` directory
- Update `src/types/api.ts`:
  - Remove `SupplierCategoryResponse`, `AppointmentCategoryResponse`, `TaskCategoryResponse`
  - Add `PlanningCategoryResponse { id, entityType, name, colour, sortOrder, isActive, allocatedAmount? }`
  - Update `SupplierResponse.category`, `AppointmentResponse.category`, `TaskResponse.category` to use `PlanningCategoryResponse`

---

## Order of execution

1. Migration SQL file
2. Prisma schema
3. New `/api/planning-categories` routes
4. Update supplier/appointment/task API routes
5. Update frontend components
6. Delete old API route directories
7. Update `types/api.ts`
