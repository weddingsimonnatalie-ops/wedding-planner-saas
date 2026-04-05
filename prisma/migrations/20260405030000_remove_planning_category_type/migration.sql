-- Deduplicate PlanningCategory: for each (weddingId, name) keep one row.
-- Prefer SUPPLIER type (may have allocatedAmount set), then TASK, then oldest.
-- Reassign FK references in child tables before deleting duplicates.

-- Reassign Supplier.categoryId to the canonical row
UPDATE "Supplier" s
SET "categoryId" = canonical.id
FROM "PlanningCategory" dup,
  LATERAL (
    SELECT id FROM "PlanningCategory"
    WHERE "weddingId" = dup."weddingId" AND lower(name) = lower(dup.name)
    ORDER BY CASE "entityType" WHEN 'SUPPLIER' THEN 1 WHEN 'TASK' THEN 2 ELSE 3 END, "createdAt"
    LIMIT 1
  ) canonical
WHERE s."categoryId" = dup.id AND dup.id != canonical.id;

-- Reassign Appointment.categoryId to the canonical row
UPDATE "Appointment" a
SET "categoryId" = canonical.id
FROM "PlanningCategory" dup,
  LATERAL (
    SELECT id FROM "PlanningCategory"
    WHERE "weddingId" = dup."weddingId" AND lower(name) = lower(dup.name)
    ORDER BY CASE "entityType" WHEN 'SUPPLIER' THEN 1 WHEN 'TASK' THEN 2 ELSE 3 END, "createdAt"
    LIMIT 1
  ) canonical
WHERE a."categoryId" = dup.id AND dup.id != canonical.id;

-- Reassign Task.categoryId to the canonical row
UPDATE "Task" t
SET "categoryId" = canonical.id
FROM "PlanningCategory" dup,
  LATERAL (
    SELECT id FROM "PlanningCategory"
    WHERE "weddingId" = dup."weddingId" AND lower(name) = lower(dup.name)
    ORDER BY CASE "entityType" WHEN 'SUPPLIER' THEN 1 WHEN 'TASK' THEN 2 ELSE 3 END, "createdAt"
    LIMIT 1
  ) canonical
WHERE t."categoryId" = dup.id AND dup.id != canonical.id;

-- Delete duplicate rows, keeping canonical per (weddingId, name)
DELETE FROM "PlanningCategory"
WHERE id NOT IN (
  SELECT DISTINCT ON ("weddingId", lower(name)) id
  FROM "PlanningCategory"
  ORDER BY "weddingId", lower(name),
    CASE "entityType" WHEN 'SUPPLIER' THEN 1 WHEN 'TASK' THEN 2 ELSE 3 END,
    "createdAt"
);

-- Drop entityType index and column
DROP INDEX IF EXISTS "PlanningCategory_weddingId_entityType_idx";
ALTER TABLE "PlanningCategory" DROP COLUMN "entityType";

-- Drop the enum
DROP TYPE "PlanningCategoryType";
