import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '@prisma/client';

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

export const COOKIE_NAME = 'wedding_id';
export const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export type WeddingCookiePayload = {
  weddingId: string;
  role: UserRole;
};

export async function signWeddingCookie(payload: WeddingCookiePayload): Promise<string> {
  return new SignJWT({ weddingId: payload.weddingId, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .sign(secret);
}

export async function verifyWeddingCookie(
  token: string
): Promise<WeddingCookiePayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const weddingId = payload.weddingId;
    const role = payload.role;
    if (typeof weddingId !== 'string' || !weddingId) return null;
    if (typeof role !== 'string' || !role) return null;
    return { weddingId, role: role as UserRole };
  } catch {
    return null;
  }
}

/**
 * Legacy helper — returns just the weddingId string.
 * Prefer verifyWeddingCookie() which also returns role.
 */
export async function verifyWeddingCookieId(token: string): Promise<string | null> {
  const payload = await verifyWeddingCookie(token);
  return payload?.weddingId ?? null;
}
