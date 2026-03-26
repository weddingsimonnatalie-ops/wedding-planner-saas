export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { signWeddingCookie, COOKIE_NAME, MAX_AGE_SECONDS } from "@/lib/wedding-cookie";
import { handleDbError } from "@/lib/db-error";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
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

    // Create Stripe Customer
    const customer = await stripe.customers.create({
      email: normalizedEmail,
      name: name.trim(),
      metadata: { userId: user.id },
    });

    // Create Wedding record + WeddingMember
    const trialDays = parseInt(process.env.TRIAL_DAYS ?? "14", 10);
    const wedding = await prisma.wedding.create({
      data: {
        stripeCustomerId: customer.id,
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
        members: {
          create: {
            userId: user.id,
            role: "ADMIN",
          },
        },
      },
    });

    // Create Stripe Checkout session
    const appUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID_STANDARD!,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: { weddingId: wedding.id },
      },
      success_url: `${appUrl}/onboarding/wedding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/register`,
      metadata: { weddingId: wedding.id },
    });

    // Sign and set weddingId cookie
    const token = await signWeddingCookie({ weddingId: wedding.id, role: "ADMIN" });
    const response = NextResponse.json({ checkoutUrl: checkoutSession.url });
    response.cookies.set(COOKIE_NAME, token, {
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
