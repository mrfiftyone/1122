import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/utils/rateLimit";

/**
 * Next.js 16 Proxy
 * Handles global security headers and IP-based rate limiting on API endpoints.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Apply Rate Limiting to API Routes
  if (pathname.startsWith("/api/")) {
    const ip = getClientIp(request.headers);

    // Stricter limits for sensitive endpoints
    let maxRequests = 60;
    let windowMs = 60000;

    if (pathname === "/api/verify-turnstile") {
      maxRequests = 30; // Max 30 verifications per minute per IP
      windowMs = 60000;
    } else if (pathname === "/api/admin-verify") {
      maxRequests = 30; // Max 30 admin checks per minute per IP
      windowMs = 60000;
    }

    const result = checkRateLimit(`${ip}:${pathname}`, { maxRequests, windowMs });

    if (!result.success) {
      const retryAfter = Math.max(1, result.reset - Math.ceil(Date.now() / 1000));
      return NextResponse.json(
        {
          error: "too_many_requests",
          message: "Rate limit exceeded. Please wait before retrying.",
          retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(result.reset),
          },
        }
      );
    }

    // Continue request with rate limit tracking headers
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(result.reset));
    applySecurityHeaders(response);
    return response;
  }

  // 2. Standard Pages: Attach security headers
  const response = NextResponse.next();
  applySecurityHeaders(response);
  return response;
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export const config = {
  matcher: [
    // Apply to API routes and pages, skipping static files, images, and icons
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
