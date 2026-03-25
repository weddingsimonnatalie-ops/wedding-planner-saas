import { authenticator } from "@otplib/v12-adapter";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Encryption helpers (AES-256-GCM)
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string and return a base64-encoded string containing:
 * [12-byte IV][16-byte auth tag][ciphertext]
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt a base64-encoded ciphertext produced by `encryptSecret`.
 */
export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

// ---------------------------------------------------------------------------
// TOTP helpers
// ---------------------------------------------------------------------------

/** Generate a new TOTP secret (Base32, 20 bytes). */
export function generateSecret(): string {
  return authenticator.generateSecret(20);
}

/**
 * Build an `otpauth://` URI compatible with Google Authenticator / Authy /
 * Apple's built-in authenticator.
 */
export function generateOtpauthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, "Wedding Planner", secret);
}

/**
 * Verify a 6-digit TOTP code against an **encrypted** secret.
 * Tolerates ±1 period (30 s) either side of the current time.
 */
export function verifyTotpCode(code: string, encryptedSecret: string): boolean {
  try {
    const secret = decryptSecret(encryptedSecret);
    authenticator.options = { window: 1 };
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Backup code helpers
// ---------------------------------------------------------------------------

const BACKUP_CODE_CHARS = "23456789abcdefghjkmnpqrstuvwxyz"; // unambiguous

function randomSegment(length: number): string {
  const bytes = crypto.randomBytes(length * 2);
  let result = "";
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    const idx = bytes[i] % BACKUP_CODE_CHARS.length;
    result += BACKUP_CODE_CHARS[idx];
  }
  return result;
}

/** Generate `count` backup codes in `xxxx-xxxx` format. */
export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => `${randomSegment(4)}-${randomSegment(4)}`);
}

/** Bcrypt-hash a backup code for storage. */
export async function hashBackupCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

/** Compare a plaintext backup code against a stored hash. */
export async function verifyBackupCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
