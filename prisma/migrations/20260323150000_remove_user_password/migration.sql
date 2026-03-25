-- Remove password column from User table (password now only stored in Account table)
ALTER TABLE "User" DROP COLUMN "password";