export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logAttempt } from "@/lib/login-attempt";

// ─── Rate limiting constants ──────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;                    // failed attempts before lockout
const WINDOW_MS    = 15 * 60 * 1000;      // 15-minute sliding window
const LOCKOUT_MS   = 15 * 60 * 1000;      // 15-minute lockout duration

// Emergency unlock via database:
// docker compose exec db psql -U wedding -c "UPDATE \"User\" SET \"lockedUntil\" = NULL;"

function extractIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

function lockedResponse(lockedUntil: Date) {
  return NextResponse.json(
    { locked: true, lockedUntil, message: "Account temporarily locked" },
    { status: 423 }
  );
}

/**
 * Unauthenticated preflight check: validates email + password and returns
 * whether the account has 2FA enabled. Used by the login page to decide
 * whether to show the TOTP step.
 */
export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { accounts: { where: { providerId: "credential" } } },
  });

  console.log("[PREFLIGHT] Email:", email, "User found:", !!user, "Accounts:", user?.accounts?.length ?? 0);

  if (!user) {
    await logAttempt(email, false, req);
    // Return the same shape as a real miss to avoid user enumeration
    return NextResponse.json({ valid: false, requires2FA: false });
  }

  // ── Rate limiting (wrapped in try/catch — must never block login) ─────────
  try {
    // 1. Check if account is already locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return lockedResponse(user.lockedUntil);
    }

    // 2. Count failures in the sliding window
    const windowStart = new Date(Date.now() - WINDOW_MS);
    const recentFailures = await prisma.loginAttempt.count({
      where: { email, success: false, createdAt: { gt: windowStart } },
    });

    // 3. Already at or over limit before we even check the password → lock now
    if (recentFailures >= MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MS);
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil } });
      await logAttempt(email, false, req);
      return lockedResponse(lockedUntil);
    }

    // 4. Validate password
    const credentialAccount = user.accounts[0];
    console.log("[PREFLIGHT] Account found:", !!credentialAccount, "Has password:", !!credentialAccount?.password, "Password length:", credentialAccount?.password?.length ?? 0);

    const valid = credentialAccount?.password
      ? await bcrypt.compare(password, credentialAccount.password)
      : false;

    console.log("[PREFLIGHT] Password valid:", valid);

    if (!valid) {
      await logAttempt(email, false, req);
      // This failure pushes us to the limit → lock
      if (recentFailures + 1 >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MS);
        await prisma.user.update({ where: { id: user.id }, data: { lockedUntil } });
        return lockedResponse(lockedUntil);
      }
      return NextResponse.json({ valid: false, requires2FA: false });
    }

    // 5. Success — clear any previous lockout
    if (user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: null } });
    }

    // Credentials are valid — successful authentication reached the 2FA gate.
    // The success attempt is logged in auth.ts authorize() after the full
    // sign-in (including any 2FA step) completes.
    return NextResponse.json({ valid: true, requires2FA: user.twoFactorEnabled });

  } catch (e) {
    console.error("Rate limit check failed:", e);
    // Database error in rate-limiting — fall back to plain password check so
    // a transient DB issue never prevents a legitimate login.
  }

  // ── Fallback: rate limiting errored, plain auth ───────────────────────────
  const credentialAccount = user.accounts[0];
  const valid = credentialAccount?.password
    ? await bcrypt.compare(password, credentialAccount.password)
    : false;
  if (!valid) {
    await logAttempt(email, false, req);
    return NextResponse.json({ valid: false, requires2FA: false });
  }
  return NextResponse.json({ valid: true, requires2FA: user.twoFactorEnabled });
}
