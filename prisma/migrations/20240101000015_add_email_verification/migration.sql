-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "verificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN "verificationTokenExpires" TIMESTAMP(3);

-- Set existing users as verified
UPDATE "User" SET "emailVerified" = "createdAt" WHERE "emailVerified" IS NULL;