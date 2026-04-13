-- ============================================================
-- Fix RLS: FORCE + missing tables
--
-- Problem 1: The `wedding` DB user owns all tables. PostgreSQL
-- lets table owners bypass RLS by default, so the existing
-- policies in 20260325000001_add_rls_policies were silently
-- ignored. FORCE ROW LEVEL SECURITY makes policies apply to
-- the table owner too.
--
-- Problem 2: Wedding, PlanningCategory, TimelineCategory,
-- TimelineEvent, Playlist, Track, and GuestMealChoice were
-- added after the original RLS migration and have no policies.
--
-- All policies use the NULL bypass:
--   OR current_setting('app.current_wedding_id', true) IS NULL
-- This allows code that runs outside withTenantContext (Stripe
-- webhook, auth checks, background jobs) to see all rows, while
-- code inside withTenantContext is restricted to its tenant.
-- ============================================================

-- ============================================================
-- Part 1: FORCE existing RLS tables
-- Policies already exist on these tables from migration
-- 20260325000001_add_rls_policies. Just add FORCE.
-- Note: SupplierCategory/AppointmentCategory/TaskCategory were
-- dropped in 20260405020000_add_planning_category, so they
-- are not listed here.
-- ============================================================

ALTER TABLE "Guest"       FORCE ROW LEVEL SECURITY;
ALTER TABLE "Table"       FORCE ROW LEVEL SECURITY;
ALTER TABLE "Room"        FORCE ROW LEVEL SECURITY;
ALTER TABLE "RoomElement" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Supplier"    FORCE ROW LEVEL SECURITY;
ALTER TABLE "Payment"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "Attachment"  FORCE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Task"        FORCE ROW LEVEL SECURITY;
ALTER TABLE "MealOption"  FORCE ROW LEVEL SECURITY;

-- ============================================================
-- Part 2: Wedding table — new RLS + FORCE
-- Wedding IS the tenant root so the policy uses "id", not
-- "weddingId". This gives DB-level protection on subscription
-- fields (subscriptionStatus, stripeSubscriptionId, etc.).
-- ============================================================

ALTER TABLE "Wedding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wedding" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Wedding"
  USING (
    "id" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

-- ============================================================
-- Part 3: New tenant tables (direct weddingId)
-- ============================================================

ALTER TABLE "PlanningCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanningCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlanningCategory"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "TimelineCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimelineCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TimelineCategory"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "TimelineEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimelineEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TimelineEvent"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "Playlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Playlist" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Playlist"
  USING (
    "weddingId" = current_setting('app.current_wedding_id', true)
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

-- ============================================================
-- Part 4: Tables without a direct weddingId (subquery policies)
-- ============================================================

ALTER TABLE "Track" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Track" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Track"
  USING (
    "playlistId" IN (
      SELECT id FROM "Playlist"
      WHERE "weddingId" = current_setting('app.current_wedding_id', true)
    )
    OR current_setting('app.current_wedding_id', true) IS NULL
  );

ALTER TABLE "GuestMealChoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestMealChoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GuestMealChoice"
  USING (
    "guestId" IN (
      SELECT id FROM "Guest"
      WHERE "weddingId" = current_setting('app.current_wedding_id', true)
    )
    OR current_setting('app.current_wedding_id', true) IS NULL
  );
