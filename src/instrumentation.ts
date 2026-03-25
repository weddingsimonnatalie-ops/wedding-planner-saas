/**
 * Next.js instrumentation hook
 * Runs when the server starts, before any requests are handled.
 * Use this for startup validation and initialization.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate environment variables on startup
    const { validateEnv } = await import("./lib/env");
    validateEnv();
  }
}