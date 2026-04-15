export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signWeddingCookie, COOKIE_NAME, MAX_AGE_SECONDS } from "@/lib/wedding-cookie";
import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Check registrations are enabled before doing anything else
    const config = await prisma.appConfig.findUnique({ where: { id: "global" } });
    if (config && !config.registrationsEnabled) {
      return NextResponse.json(
        { error: "New registrations are currently disabled." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, email, password } = body as {
      name?: string;
      email?: string;
      password?: string;
    };

    // Validate inputs
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { error: "Password must be 8–128 characters" },
        { status: 400 }
      );
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: "Name too long (max 100 characters)" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check email not already taken
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create User + Account (Better Auth pattern)
    const user = await prisma.user.create({
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

    // Create Wedding on Free Tier — no payment required
    const wedding = await prisma.wedding.create({
      data: {
        subscriptionStatus: "FREE",
        members: {
          create: {
            userId: user.id,
            role: "ADMIN",
          },
        },
      },
    });

    // Sign and set weddingId cookie
    const appUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const token = await signWeddingCookie({ weddingId: wedding.id, role: "ADMIN" });
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: appUrl.startsWith("https://"),
      sameSite: "lax",
      maxAge: MAX_AGE_SECONDS,
      path: "/",
      domain: process.env.COOKIE_DOMAIN || undefined,
    });

    return response;
  } catch (error) {
    return handleDbError(error);
  }
}