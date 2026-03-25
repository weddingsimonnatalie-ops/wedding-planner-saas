import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth-better";

// Public paths that don't require authentication
const publicPaths = [
  "/login",
  "/rsvp",
  "/api/auth",
  "/api/rsvp",
  "/api/health",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/static")
  ) {
    return NextResponse.next();
  }

  // Check session using Better Auth
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      const loginUrl = new URL("/login", request.url);
      // Preserve the original URL so user returns after login
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Middleware session check error:", error);
    const loginUrl = new URL("/login", request.url);
    // Preserve the original URL so user returns after login
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /login (auth page)
     * - /rsvp/* (public RSVP pages)
     * - /api/auth/* (Better Auth API routes)
     * - /api/rsvp/* (public RSVP API)
     * - /api/health (health check)
     * - /_next/* (Next.js internals)
     * - /favicon.ico, static files
     */
    "/((?!login|rsvp|api/auth|api/rsvp|api/health|_next/static|_next/image|favicon.ico).*)",
  ],
};