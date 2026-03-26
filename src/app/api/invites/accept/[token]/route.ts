export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth-better";
import { signWeddingCookie, COOKIE_NAME, MAX_AGE_SECONDS } from "@/lib/wedding-cookie";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { handleDbError } from "@/lib/db-error";

type Params = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { token } = await params;

  // Rate limiting: 10 requests/IP/min, 5 attempts/token/min
  const ip = extractIp(req);
  const [ipLimit, tokenLimit] = await Promise.all([
    checkRateLimit(`invite:ip:${ip}`, 10, 60_000),
    checkRateLimit(`invite:token:${token}`, 5, 60_000),
  ]);
  if (ipLimit.limited || tokenLimit.limited) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  try {
    // Look up the invite by token
    const invite = await prisma.weddingInvite.findUnique({
      where: { token },
      include: { wedding: { select: { id: true, coupleName: true } } },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
    }
    if (invite.usedAt) {
      return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
    }
    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
    }

    const appUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");

    // Check for an existing Better Auth session
    const session = await auth.api.getSession({ headers: req.headers });

    if (session?.user) {
      // Existing user path: add them to the wedding
      const userId = session.user.id;

      const existing = await prisma.weddingMember.findUnique({
        where: { userId_weddingId: { userId, weddingId: invite.weddingId } },
      });

      if (!existing) {
        await prisma.weddingMember.create({
          data: { userId, weddingId: invite.weddingId, role: invite.role },
        });
      }

      await prisma.weddingInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedBy: userId },
      });

      // Issue wedding cookie for the new wedding context
      const cookieToken = await signWeddingCookie({ weddingId: invite.weddingId, role: invite.role });
      const response = NextResponse.json({ success: true, requireSignIn: false });
      response.cookies.set(COOKIE_NAME, cookieToken, {
        httpOnly: true,
        secure: appUrl.startsWith("https://"),
        sameSite: "lax",
        maxAge: MAX_AGE_SECONDS,
        path: "/",
      });
      return response;
    }

    // New user path: require name, email, password
    const body = await req.json().catch(() => ({})) as {
      name?: string;
      email?: string;
      password?: string;
    };
    const { name, email, password } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: "Password must be 8–128 characters" }, { status: 400 });
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: "Name too long (max 100 characters)" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // If invite has a specific email, enforce it matches
    if (invite.email && invite.email !== normalizedEmail) {
      return NextResponse.json(
        { error: "This invite was sent to a different email address" },
        { status: 403 }
      );
    }

    // Check if account already exists
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json(
        {
          error: "An account with that email already exists. Please log in to accept this invite.",
          existingAccount: true,
        },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);

    // Create User + Account
    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        accounts: {
          create: {
            providerId: "credential",
            accountId: normalizedEmail,
            password: hashed,
          },
        },
      },
    });

    // Create WeddingMember and mark invite used in parallel
    await Promise.all([
      prisma.weddingMember.create({
        data: { userId: newUser.id, weddingId: invite.weddingId, role: invite.role },
      }),
      prisma.weddingInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedBy: newUser.id },
      }),
    ]);

    // Set wedding cookie so it's ready after the client signs in
    const cookieToken = await signWeddingCookie({ weddingId: invite.weddingId, role: invite.role });
    const response = NextResponse.json({ success: true, requireSignIn: true });
    response.cookies.set(COOKIE_NAME, cookieToken, {
      httpOnly: true,
      secure: appUrl.startsWith("https://"),
      sameSite: "lax",
      maxAge: MAX_AGE_SECONDS,
      path: "/",
    });
    return response;
  } catch (error) {
    return handleDbError(error);
  }
}
