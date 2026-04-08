-- Add albumArt and deezerUrl to Track
ALTER TABLE "Track" ADD COLUMN "albumArt" TEXT;
ALTER TABLE "Track" ADD COLUMN "deezerUrl" TEXT;