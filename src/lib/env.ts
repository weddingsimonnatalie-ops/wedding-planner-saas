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
  resendApiKey?: string;
  seatingAppUrl?: string;
}

let config: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (config) return config;

  // Required: Core
  const nextauthSecret = requireEnv("NEXTAUTH_SECRET");
  const nextauthUrl = requireEnv("NEXTAUTH_URL");

  // Optional: Redis
  const redisUrl = getEnv("REDIS_URL");

  // Optional: Resend (email sending)
  const resendApiKey = getEnv("RESEND_API_KEY");

  // Optional: Seating visual tools app URL (for "Open Visual Tools" link)
  const seatingAppUrl = getEnv("NEXT_PUBLIC_SEATING_APP_URL");

  config = {
    nextauthSecret,
    nextauthUrl,
    redisUrl,
    resendApiKey,
    seatingAppUrl,
  };

  return config;
}

/**
 * Validate environment on import.
 * Call this early in startup (e.g., in instrumentation.ts).
 */
export function validateEnv(): void {
  getEnvConfig();

  // Stripe keys are validated lazily in stripe.ts (not available at build time),
  // but warn early so misconfigured deploys are visible in startup logs.
  if (!process.env.STRIPE_SECRET_KEY)
    console.warn("[env] STRIPE_SECRET_KEY not set — Stripe features will fail");
  if (!process.env.STRIPE_WEBHOOK_SECRET)
    console.warn("[env] STRIPE_WEBHOOK_SECRET not set — webhook signature verification will fail");

  // Ollama is optional — AI timeline generation degrades gracefully when missing.
  if (!process.env.OLLAMA_API_KEY)
    console.warn("[env] OLLAMA_API_KEY not set — AI timeline generation will be unavailable");

  console.log("[env] Environment validated successfully");
}
