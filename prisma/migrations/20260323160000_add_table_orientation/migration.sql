-- Create Orientation enum
CREATE TYPE "Orientation" AS ENUM ('HORIZONTAL', 'VERTICAL');

-- Add orientation column to Table with default
ALTER TABLE "Table" ADD COLUMN "orientation" "Orientation" NOT NULL DEFAULT 'VERTICAL';