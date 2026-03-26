/**
 * Environment variable validation
 * Run on startup to ensure all required configuration is present.
 * Throws clear errors instead of cryptic runtime failures.
 *
 * NOTE: Stripe keys are validated lazily in src/lib/stripe.ts (not available
 * at Next.js build time on Railway — only injected at runtime).
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
  nextauthSecret: string;
  nextauthUrl: string;
  // Optional
  redisUrl?: string;
  smtp?: {
    host: string;
    port: string;
    user: string;
    pass: string;
    from: string;
  };
}

let config: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (config) return config;

  // Required: Core
  const nextauthSecret = requireEnv("NEXTAUTH_SECRET");
  const nextauthUrl = requireEnv("NEXTAUTH_URL");

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
    nextauthSecret,
    nextauthUrl,
    redisUrl,
    smtp,
  };

  return config;
}

/**
 * Validate environment on import.
 * Call this early in startup (e.g., in instrumentation.ts).
 */
export function validateEnv(): void {
  getEnvConfig();
  console.log("[env] Environment validated successfully");
}
