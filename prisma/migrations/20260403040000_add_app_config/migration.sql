-- Singleton global config table. Always contains exactly one row (id = 'global').
CREATE TABLE "AppConfig" (
  "id"                   TEXT    NOT NULL DEFAULT 'global',
  "registrationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- Seed the single row so the app never has to handle a missing row
INSERT INTO "AppConfig" ("id", "registrationsEnabled")
VALUES ('global', true)
ON CONFLICT ("id") DO NOTHING;
