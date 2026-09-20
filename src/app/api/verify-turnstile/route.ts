import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/verify-turnstile
 *
 * Server-side verification of Cloudflare Turnstile tokens.
 * The TURNSTILE_SECRET_KEY env var is never exposed to the browser.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "missing_token" }, { status: 400 });
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      console.error("TURNSTILE_SECRET_KEY is not configured in environment variables");
      return NextResponse.json({ success: false, error: "server_config_error" }, { status: 500 });
    }

    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);

    // Forward the client IP for additional security (optional)
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";
    if (ip) formData.append("remoteip", ip);

    const cfResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const result = await cfResponse.json();

    if (result.success) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "verification_failed", codes: result["error-codes"] },
      { status: 403 }
    );
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
