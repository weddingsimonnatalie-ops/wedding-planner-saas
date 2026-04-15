-- Add composite indexes for tenant-scoped queries
-- Task: weddingId + isCompleted + dueDate (dashboard stats/counts filter on all three)
-- Payment: weddingId + status + dueDate (dashboard stats/counts filter on weddingId+status; existing [status,dueDate] lacks weddingId prefix)
-- Supplier: weddingId + status (dashboard groupBy and list status filter)

CREATE INDEX "Task_weddingId_isCompleted_dueDate_idx" ON "Task"("weddingId", "isCompleted", "dueDate");
CREATE INDEX "Payment_weddingId_status_dueDate_idx" ON "Payment"("weddingId", "status", "dueDate");
CREATE INDEX "Supplier_weddingId_status_idx" ON "Supplier"("weddingId", "status");
