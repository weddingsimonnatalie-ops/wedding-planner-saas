import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

// Use NEXTAUTH_URL from .env - this should be set to your production URL in prod
// Local: http://192.168.6.249:3000
// Prod: https://planner.simon-natalie.com
const baseURL = process.env.NEXTAUTH_URL || "http://localhost:3000";

// Secret for signing session tokens
// NEXTAUTH_SECRET is used for backwards compatibility with existing sessions
// Falls back to a build-time placeholder (runtime validation in env.ts ensures real secret is set)
const secret = process.env.NEXTAUTH_SECRET || process.env.BETTER_AUTH_SECRET || "build-time-placeholder-do-not-use-in-production";

export const auth = betterAuth({
  baseURL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days (matches next-auth default)
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days — required for middleware (Edge runtime, no Prisma)
      // API routes bypass this cache by querying the DB directly via requireRole().
    },
  },
  account: {
    accountLinking: {
      enabled: false, // We only use credentials provider
    },
  },
  user: {
    additionalFields: {
      // role was removed from User — it is now per-wedding on WeddingMember.
      // session.ts reads it via (session.user as any).role ?? "VIEWER".
      twoFactorEnabled: {
        type: "boolean",
        required: true,
        input: false,
      },
      twoFactorSecret: {
        type: "string",
        required: false,
        input: false,
      },
      lockedUntil: {
        type: "date",
        required: false,
        input: false,
      },
      sessionVersion: {
        type: "number",
        required: true,
        input: false,
      },
      emailVerified: {
        type: "date",
        required: false,
        input: false,
      },
      verificationToken: {
        type: "string",
        required: false,
        input: false,
      },
      verificationTokenExpires: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // We have optional email verification
    password: {
      // Use bcryptjs to match existing password hashes
      hash: async (password: string) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },
  secret,
  trustedOrigins: [
    baseURL,
    // Additional origins for local network access (e.g. http://192.168.x.x:3001)
    // Set BETTER_AUTH_TRUSTED_ORIGINS as a comma-separated list in .env
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS
      ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
      : []),
  ],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;