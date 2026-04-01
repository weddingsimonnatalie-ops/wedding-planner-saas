-- Add totalBudget to Wedding
ALTER TABLE "Wedding" ADD COLUMN "totalBudget" DOUBLE PRECISION;

-- Add allocatedAmount to SupplierCategory
ALTER TABLE "SupplierCategory" ADD COLUMN "allocatedAmount" DOUBLE PRECISION;