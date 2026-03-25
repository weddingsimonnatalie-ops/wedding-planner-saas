-- Add performance indexes for frequently queried fields

-- Guest tableId index (used in seating queries)
CREATE INDEX "Guest_tableId_idx" ON "Guest"("tableId");

-- Task indexes for filtering and sorting
CREATE INDEX "Task_isCompleted_dueDate_idx" ON "Task"("isCompleted", "dueDate");
CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");
CREATE INDEX "Task_categoryId_idx" ON "Task"("categoryId");
CREATE INDEX "Task_supplierId_idx" ON "Task"("supplierId");