import * as nodemailer from "nodemailer";
import * as he from "he";

/**
 * Convert HSL color values to a hex string for use in email HTML.
 * Email clients don't support CSS variables or HSL directly, so we pre-compute hex.
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Escape HTML entities to prevent XSS in email templates.
 * Use for all user-editable values interpolated into HTML content.
 */
const esc = (value: string | null | undefined): string => {
  if (!value) return "";
  return he.escape(value);
};

/**
 * Validate and sanitize URLs to prevent javascript: protocol injection.
 * Only allows http: and https: protocols; returns '#' for invalid URLs.
 */
const safeUrl = (value: string | null | undefined): string => {
  if (!value) return "#";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "#";
    return url.toString();
  } catch {
    return "#";
  }
};

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    secure: false,
    auth: { user, pass },
  });
}

export async function sendRsvpEmail(
  guestEmail: string,
  guestFirstName: string,
  rsvpToken: string,
  coupleName: string,
  weddingDate?: Date | null,
  themeHue?: number | null
): Promise<{ ok: boolean; message: string }> {
  const accentColor = hslToHex(themeHue ?? 330, 60, 55);
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM ?? "noreply@localhost";
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const rsvpUrl = `${baseUrl}/rsvp/${rsvpToken}`;
  const unsubscribeUrl = `${baseUrl}/unsubscribe/${rsvpToken}`;

  const subject = `You're invited — please RSVP for ${coupleName}`;

  const dateStr = weddingDate
    ? weddingDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : null;

  const text = `Hi ${guestFirstName},

We'd love to know if you can make it to our wedding.

RSVP here: ${rsvpUrl}

${coupleName}

---
Don't want to receive reminder emails? Unsubscribe here: ${unsubscribeUrl}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: Georgia, serif; background: #f9f7f4; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9f7f4; padding: 40px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; padding: 48px 40px; max-width: 520px; width: 100%;">
        <tr><td style="text-align: center; padding-bottom: 32px; border-bottom: 1px solid #e5e0d8;">
          <h1 style="font-size: 26px; color: #1a1a1a; margin: 0 0 8px; font-weight: normal;">${esc(coupleName)}</h1>
          ${dateStr ? `<p style="font-size: 15px; color: #888; margin: 0;">${dateStr}</p>` : ""}
        </td></tr>
        <tr><td style="padding-top: 32px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 16px;">Hi ${esc(guestFirstName)},</p>
          <p style="font-size: 16px; color: #333; margin: 0 0 32px; line-height: 1.6;">We'd love to know if you can make it to our wedding. Please click the button below to RSVP.</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom: 32px;">
              <a href="${safeUrl(rsvpUrl)}" style="display: inline-block; background: ${accentColor}; color: #ffffff; text-decoration: none; padding: 14px 48px; border-radius: 6px; font-size: 16px; font-weight: bold; letter-spacing: 0.5px;">RSVP Now</a>
            </td></tr>
          </table>
          <p style="font-size: 13px; color: #aaa; margin: 0 0 6px;">Or copy this link:</p>
          <p style="font-size: 13px; word-break: break-all; margin: 0 0 32px;"><a href="${safeUrl(rsvpUrl)}" style="color: ${accentColor};">${esc(rsvpUrl)}</a></p>
          <p style="font-size: 15px; color: #555; margin: 0; border-top: 1px solid #e5e0d8; padding-top: 24px;">${esc(coupleName)}</p>
        </td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%; padding-top: 16px;">
        <tr><td style="text-align: center;">
          <p style="font-size: 12px; color: #999; margin: 0;">
            Don't want to receive reminder emails? <a href="${safeUrl(unsubscribeUrl)}" style="color: ${accentColor}; text-decoration: underline;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (!transporter) {
    console.log(`[email] SMTP not configured. Would send to ${guestEmail}:`);
    console.log(`[email] Subject: ${subject}`);
    console.log(`[email] RSVP URL: ${rsvpUrl}`);
    return { ok: true, message: `Email logged to console (SMTP not configured)` };
  }

  try {
    await transporter.sendMail({ from, to: guestEmail, subject, text, html });
    return { ok: true, message: `Email sent to ${guestEmail}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email] Failed to send to ${guestEmail}: ${msg}`);
    return { ok: false, message: `Failed to send: ${msg}` };
  }
}

export async function sendAppointmentReminderEmail(
  to: string,
  title: string,
  category: string,
  date: Date,
  daysAway: number,
  location: string | null,
  supplierName: string | null,
  notes: string | null
): Promise<{ ok: boolean; message: string }> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM ?? "noreply@localhost";

  const dateStr = date.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }) + " at " + date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });

  const subject = `Reminder: ${title} in ${daysAway} day${daysAway !== 1 ? "s" : ""}`;

  const lines = [
    `Appointment: ${title}`,
    `Category: ${category}`,
    `Date: ${dateStr}`,
    location ? `Location: ${location}` : null,
    supplierName ? `Supplier: ${supplierName}` : null,
    notes ? `Notes: ${notes}` : null,
  ].filter(Boolean).join("\n");

  const text = `You have an upcoming appointment:\n\n${lines}`;

  if (!transporter) {
    console.log(`[email] SMTP not configured. Appointment reminder would be sent to ${to}: ${subject}`);
    return { ok: true, message: "Email logged to console (SMTP not configured)" };
  }

  try {
    await transporter.sendMail({ from, to, subject, text });
    return { ok: true, message: `Reminder sent to ${to}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Failed to send: ${msg}` };
  }
}

export async function sendPaymentReminderEmail(
  to: string,
  supplierName: string,
  label: string,
  amount: number,
  dueDate: Date
): Promise<{ ok: boolean; message: string }> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM ?? "noreply@localhost";
  const due = dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const subject = `Payment reminder: ${supplierName} — ${label}`;
  const text = `Reminder: ${label} of £${amount.toFixed(2)} to ${supplierName} is due on ${due}.`;

  if (!transporter) {
    console.log(`[email] SMTP not configured. Payment reminder would be sent to ${to}`);
    return { ok: true, message: "Email logged to console (SMTP not configured)" };
  }

  try {
    await transporter.sendMail({ from, to, subject, text });
    return { ok: true, message: `Reminder sent to ${to}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Failed to send: ${msg}` };
  }
}

/**
 * Generate a random verification token.
 */
function generateVerificationToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Send email verification link to a new user.
 */
export async function sendVerificationEmail(
  userEmail: string,
  userName: string | null,
  verificationToken: string,
  coupleName: string,
  themeHue?: number | null
): Promise<{ ok: boolean; message: string }> {
  const accentColor = hslToHex(themeHue ?? 330, 60, 55);
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM ?? "noreply@localhost";
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const verifyUrl = `${baseUrl}/verify-email/${verificationToken}`;

  const subject = `Verify your email for ${coupleName} Wedding Planner`;

  const text = `Hello ${userName || "there"},\n\nAn account has been created for you on ${coupleName}'s Wedding Planner.\n\nPlease verify your email by visiting this link:\n${verifyUrl}\n\nThis link will expire in 24 hours.\n\nIf you didn't expect this email, you can safely ignore it.`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: Georgia, serif; background: #f9f7f4; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9f7f4; padding: 40px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; padding: 48px 40px; max-width: 520px; width: 100%;">
        <tr><td style="text-align: center; padding-bottom: 32px; border-bottom: 1px solid #e5e0d8;">
          <h1 style="font-size: 26px; color: #1a1a1a; margin: 0; font-weight: normal;">${esc(coupleName)}</h1>
        </td></tr>
        <tr><td style="padding-top: 32px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 16px;">Hello ${esc(userName || "there")},</p>
          <p style="font-size: 16px; color: #333; margin: 0 0 32px; line-height: 1.6;">An account has been created for you. Please verify your email address by clicking the button below.</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom: 32px;">
              <a href="${safeUrl(verifyUrl)}" style="display: inline-block; background: ${accentColor}; color: #ffffff; text-decoration: none; padding: 14px 48px; border-radius: 6px; font-size: 16px; font-weight: bold; letter-spacing: 0.5px;">Verify Email</a>
            </td></tr>
          </table>
          <p style="font-size: 13px; color: #aaa; margin: 0 0 6px;">Or copy this link:</p>
          <p style="font-size: 13px; word-break: break-all; margin: 0 0 32px;"><a href="${safeUrl(verifyUrl)}" style="color: ${accentColor};">${esc(verifyUrl)}</a></p>
          <p style="font-size: 13px; color: #888; margin: 0; border-top: 1px solid #e5e0d8; padding-top: 24px;">This link will expire in 24 hours. If you didn't expect this email, you can safely ignore it.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (!transporter) {
    console.log(`[email] SMTP not configured. Verification email would be sent to ${userEmail}:`);
    console.log(`[email] Verification URL: ${verifyUrl}`);
    return { ok: true, message: "Email logged to console (SMTP not configured)" };
  }

  try {
    await transporter.sendMail({ from, to: userEmail, subject, text, html });
    return { ok: true, message: `Verification email sent to ${userEmail}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email] Failed to send verification to ${userEmail}: ${msg}`);
    return { ok: false, message: `Failed to send: ${msg}` };
  }
}

/**
 * Send a wedding invitation email to a new team member.
 */
export async function sendInviteEmail(
  to: string,
  coupleName: string,
  inviteUrl: string,
  role: string,
  themeHue?: number | null
): Promise<{ ok: boolean; message: string }> {
  const accentColor = hslToHex(themeHue ?? 330, 60, 55);
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM ?? "noreply@localhost";

  const roleLabel: Record<string, string> = {
    ADMIN: "Admin",
    VIEWER: "Viewer",
    RSVP_MANAGER: "RSVP Manager",
  };
  const roleName = roleLabel[role] ?? role;

  const subject = `You've been invited to help plan ${coupleName}'s wedding`;

  const text = `You've been invited to join ${coupleName}'s wedding planning team as ${roleName}.\n\nAccept your invite here: ${inviteUrl}\n\nThis link expires in 7 days.`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: Georgia, serif; background: #f9f7f4; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9f7f4; padding: 40px 16px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; padding: 48px 40px; max-width: 520px; width: 100%;">
        <tr><td style="text-align: center; padding-bottom: 32px; border-bottom: 1px solid #e5e0d8;">
          <h1 style="font-size: 26px; color: #1a1a1a; margin: 0; font-weight: normal;">${esc(coupleName)}</h1>
        </td></tr>
        <tr><td style="padding-top: 32px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 16px;">You&rsquo;ve been invited to join the wedding planning team.</p>
          <p style="font-size: 16px; color: #333; margin: 0 0 32px; line-height: 1.6;">
            You&rsquo;ll be added as <strong>${esc(roleName)}</strong>. Click the button below to accept your invite and get started.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom: 32px;">
              <a href="${safeUrl(inviteUrl)}" style="display: inline-block; background: ${accentColor}; color: #ffffff; text-decoration: none; padding: 14px 48px; border-radius: 6px; font-size: 16px; font-weight: bold; letter-spacing: 0.5px;">Accept invite</a>
            </td></tr>
          </table>
          <p style="font-size: 13px; color: #aaa; margin: 0 0 6px;">Or copy this link:</p>
          <p style="font-size: 13px; word-break: break-all; margin: 0 0 32px;"><a href="${safeUrl(inviteUrl)}" style="color: ${accentColor};">${esc(inviteUrl)}</a></p>
          <p style="font-size: 13px; color: #888; margin: 0; border-top: 1px solid #e5e0d8; padding-top: 24px;">This link expires in 7 days. If you weren&rsquo;t expecting this invitation, you can safely ignore it.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (!transporter) {
    console.log(`[email] SMTP not configured. Invite would be sent to ${to}:`);
    console.log(`[email] Invite URL: ${inviteUrl}`);
    return { ok: true, message: "Email logged to console (SMTP not configured)" };
  }

  try {
    await transporter.sendMail({ from, to, subject, text, html });
    return { ok: true, message: `Invite sent to ${to}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email] Failed to send invite to ${to}: ${msg}`);
    return { ok: false, message: `Failed to send: ${msg}` };
  }
}

export { generateVerificationToken };
