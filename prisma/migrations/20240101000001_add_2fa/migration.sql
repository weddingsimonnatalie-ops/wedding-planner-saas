-- Add 2FA fields to User
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "twoFactorSecret" TEXT;

-- Create BackupCode table
CREATE TABLE "BackupCode" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "codeHash"  TEXT         NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackupCode_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BackupCode"
  ADD CONSTRAINT "BackupCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
