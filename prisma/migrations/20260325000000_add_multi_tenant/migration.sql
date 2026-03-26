-- Phase 1: Multi-tenancy migration
-- Adds Wedding, WeddingMember, WeddingInvite, StripeEvent tables
-- Adds weddingId to all tenant-scoped tables
-- Removes WeddingConfig singleton
-- Removes role from User (role is now on WeddingMember)

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'PAUSED');

-- CreateTable: Wedding
CREATE TABLE "Wedding" (
    "id" TEXT NOT NULL,
    "coupleName" TEXT NOT NULL DEFAULT 'Our Wedding',
    "weddingDate" TIMESTAMP(3),
    "venueName" TEXT,
    "venueAddress" TEXT,
    "reminderEmail" TEXT,
    "sessionTimeout" INTEGER NOT NULL DEFAULT 30,
    "sessionWarningTime" INTEGER NOT NULL DEFAULT 5,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" "SubStatus" NOT NULL DEFAULT 'TRIALING',
    "subscriptionPlan" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "deleteScheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WeddingMember
CREATE TABLE "WeddingMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeddingMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WeddingInvite
CREATE TABLE "WeddingInvite" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'RSVP_MANAGER',
    "email" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeddingInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StripeEvent
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Wedding unique constraints
CREATE UNIQUE INDEX "Wedding_stripeCustomerId_key" ON "Wedding"("stripeCustomerId");
CREATE UNIQUE INDEX "Wedding_stripeSubscriptionId_key" ON "Wedding"("stripeSubscriptionId");

-- CreateIndex: WeddingMember unique + indexes
CREATE UNIQUE INDEX "WeddingMember_userId_weddingId_key" ON "WeddingMember"("userId", "weddingId");
CREATE INDEX "WeddingMember_userId_idx" ON "WeddingMember"("userId");
CREATE INDEX "WeddingMember_weddingId_idx" ON "WeddingMember"("weddingId");

-- CreateIndex: WeddingInvite
CREATE UNIQUE INDEX "WeddingInvite_token_key" ON "WeddingInvite"("token");
CREATE INDEX "WeddingInvite_weddingId_idx" ON "WeddingInvite"("weddingId");

-- CreateIndex: StripeEvent
CREATE UNIQUE INDEX "StripeEvent_eventId_key" ON "StripeEvent"("eventId");

-- Add weddingId to Guest
ALTER TABLE "Guest" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "Guest_weddingId_idx" ON "Guest"("weddingId");
CREATE INDEX "Guest_weddingId_groupName_idx" ON "Guest"("weddingId", "groupName");
CREATE INDEX "Guest_weddingId_rsvpStatus_idx" ON "Guest"("weddingId", "rsvpStatus");

-- Add weddingId to Table
ALTER TABLE "Table" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "Table_weddingId_idx" ON "Table"("weddingId");

-- Add weddingId to Room
ALTER TABLE "Room" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "Room_weddingId_idx" ON "Room"("weddingId");

-- Add weddingId to RoomElement
ALTER TABLE "RoomElement" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "RoomElement_weddingId_idx" ON "RoomElement"("weddingId");

-- Add weddingId to Supplier
ALTER TABLE "Supplier" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "Supplier_weddingId_idx" ON "Supplier"("weddingId");

-- Add weddingId to Payment
ALTER TABLE "Payment" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "Payment_weddingId_idx" ON "Payment"("weddingId");

-- Add weddingId to Attachment
ALTER TABLE "Attachment" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "Attachment_weddingId_idx" ON "Attachment"("weddingId");

-- Add weddingId to Appointment
ALTER TABLE "Appointment" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "Appointment_weddingId_idx" ON "Appointment"("weddingId");

-- Add weddingId to Task
ALTER TABLE "Task" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "Task_weddingId_idx" ON "Task"("weddingId");

-- Add weddingId to MealOption
ALTER TABLE "MealOption" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "MealOption_weddingId_idx" ON "MealOption"("weddingId");

-- Clear category seed data inserted by earlier migrations (migration 3 seeds SupplierCategory
-- and AppointmentCategory for the single-tenant app; in SaaS mode categories are per-wedding
-- and will be recreated by the seed script for the dev wedding).
-- FK constraints use ON DELETE SET NULL so this safely nullifies categoryId on linked rows.
DELETE FROM "SupplierCategory";
DELETE FROM "AppointmentCategory";
DELETE FROM "TaskCategory";

-- Add weddingId to SupplierCategory
ALTER TABLE "SupplierCategory" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "SupplierCategory_weddingId_idx" ON "SupplierCategory"("weddingId");

-- Drop unique constraint on SupplierCategory.name (will be scoped per wedding)
ALTER TABLE "SupplierCategory" DROP CONSTRAINT IF EXISTS "SupplierCategory_name_key";

-- Add weddingId to AppointmentCategory
ALTER TABLE "AppointmentCategory" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "AppointmentCategory_weddingId_idx" ON "AppointmentCategory"("weddingId");

-- Drop unique constraint on AppointmentCategory.name
ALTER TABLE "AppointmentCategory" DROP CONSTRAINT IF EXISTS "AppointmentCategory_name_key";

-- Add weddingId to TaskCategory
ALTER TABLE "TaskCategory" ADD COLUMN "weddingId" TEXT NOT NULL;
CREATE INDEX "TaskCategory_weddingId_idx" ON "TaskCategory"("weddingId");

-- Drop unique constraint on TaskCategory.name
ALTER TABLE "TaskCategory" DROP CONSTRAINT IF EXISTS "TaskCategory_name_key";

-- Remove role from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";

-- Drop WeddingConfig
DROP TABLE IF EXISTS "WeddingConfig";

-- AddForeignKey: WeddingMember
ALTER TABLE "WeddingMember" ADD CONSTRAINT "WeddingMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeddingMember" ADD CONSTRAINT "WeddingMember_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WeddingInvite
ALTER TABLE "WeddingInvite" ADD CONSTRAINT "WeddingInvite_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: tenant tables (will be enforced after data backfill in seed)
-- Note: weddingId columns are nullable until seed populates them, then NOT NULL constraint added
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Table" ADD CONSTRAINT "Table_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomElement" ADD CONSTRAINT "RoomElement_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealOption" ADD CONSTRAINT "MealOption_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierCategory" ADD CONSTRAINT "SupplierCategory_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentCategory" ADD CONSTRAINT "AppointmentCategory_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCategory" ADD CONSTRAINT "TaskCategory_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
