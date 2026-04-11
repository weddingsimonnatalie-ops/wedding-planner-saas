-- Stores the ISO billing currency chosen at checkout ("gbp", "eur", "usd").
-- Default "gbp" covers all existing rows — nightly reconcile corrects any
-- that were actually EUR/USD within 24h of deploy.
ALTER TABLE "Wedding" ADD COLUMN "subscriptionCurrency" TEXT NOT NULL DEFAULT 'gbp';
