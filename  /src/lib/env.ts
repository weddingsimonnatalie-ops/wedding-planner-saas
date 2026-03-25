/**
 * Environment variable validation
 * Run on startup to ensure all required configuration is present.
 * Throws clear errors instead of cryptic runtime failures.
 */

function getEnv(name: string): string | undefined {
  return process.env[name];
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

interface EnvConfig {
  databaseUrl: string;
  nextauthSecret: string;
  nextauthUrl: string;
  seedAdmin1Name: string;
  seedAdmin1Email: string;
  seedAdmin1Password: string;
  // Optional
  redisUrl?: string;
  smtp?: {
    host: string;
    port: string;
    user: string;
    pass: string;
    from: string;
  };
  emailVerificationRequired: boolean;
}

let config: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (config) return config;

  // Required: Core
  const dbPassword = requireEnv("DB_PASSWORD");
  const nextauthSecret = requireEnv("NEXTAUTH_SECRET");
  const nextauthUrl = requireEnv("NEXTAUTH_URL");

  // Required: Seed admin
  const seedAdmin1Name = requireEnv("SEED_ADMIN_1_NAME");
  const seedAdmin1Email = requireEnv("SEED_ADMIN_1_EMAIL");
  const seedAdmin1Password = requireEnv("SEED_ADMIN_1_PASSWORD");

  // Optional: Redis
  const redisUrl = getEnv("REDIS_URL");

  // Optional: SMTP (all or nothing)
  const smtpHost = getEnv("SMTP_HOST");
  const smtpPort = getEnv("SMTP_PORT");
  const smtpUser = getEnv("SMTP_USER");
  const smtpPass = getEnv("SMTP_PASS");
  const smtpFrom = getEnv("SMTP_FROM");

  let smtp: EnvConfig["smtp"];
  if (smtpHost || smtpUser || smtpPass || smtpFrom) {
    // If any SMTP var is set, require all of them
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      throw new Error(
        "SMTP configuration incomplete. If using SMTP, you must set: SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM"
      );
    }
    smtp = {
      host: smtpHost,
      port: smtpPort || "587",
      user: smtpUser,
      pass: smtpPass,
      from: smtpFrom,
    };
  }

  config = {
    databaseUrl: `postgresql://wedding:${dbPassword}@db:5432/wedding`,
    nextauthSecret,
    nextauthUrl,
    seedAdmin1Name,
    seedAdmin1Email,
    seedAdmin1Password,
    redisUrl,
    smtp,
    emailVerificationRequired: getEnv("EMAIL_VERIFICATION_REQUIRED") === "true",
  };

  return config;
}

/**
 * Validate environment on import.
 * Call this early in startup (e.g., in instrumentation.ts or lib/prisma.ts).
 */
export function validateEnv(): void {
  getEnvConfig();
  console.log("[env] Environment validated successfully");
}