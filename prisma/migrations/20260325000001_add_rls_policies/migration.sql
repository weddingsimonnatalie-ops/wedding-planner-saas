-- Phase 1: Row Level Security policies
-- Enables RLS on all tenant-scoped tables
-- Policy uses current_setting('app.current_wedding_id', true):
--   - true flag means returns NULL (not throw) when variable is unset
--   - NULL short-circuits to no restriction, so migrations (running as superuser, which bypasses RLS) are unaffected
--   - withTenantContext() sets this variable via SET LOCAL inside a transaction

ALTER TABLE "Guest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Guest"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "Table" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Table"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Room"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "RoomElement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RoomElement"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Supplier"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Attachment"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Appointment"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Task"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "MealOption" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MealOption"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "SupplierCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupplierCategory"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "AppointmentCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AppointmentCategory"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "TaskCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TaskCategory"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );
